// eslint-disable-next-line no-unused-vars
import { Plugin } from "./Main";
interface ISourceSelection {
    sourceProject:string,
    selection:IReference[]
}

interface INewItemMap {[key:string]:XRTrimNeedleItem}
export class Tool{
    
    /** callback to show or hide the menu for a selected item or folder
    * 
    * */ 
    showMenu(itemId:string) {
        return itemId && ml.Item.parseRef(itemId).isFolder;
    }

    /** callback when user executes the custom the menu entry added to items or folders 
     * 
     * */ 
    async menuClicked(itemId:string) {
        /* get the root to be imported into this category */
        let roots = await this.selectSourceItems();
        let rootCat = "";
        for (let sel of roots.selection) {
            let cat = ml.Item.parseRef(sel.to).type;
            if (rootCat && cat!= rootCat) {
                ml.UI.showError("only one source category", "You can import only from one source category");
                return;
            }
            rootCat = cat;
        }
        console.log(roots);

        // get the other categories from other project
        let catsExtended = <XRGetProjectStructAck>await restConnection.getServer( roots.sourceProject + "/cat");
        // filter them to categories which are different than source and exist in this project
        let allCategories = catsExtended.categoryList.categoryExtended.map( c => c.category.shortLabel).filter( c => c!= "FOLDER" && c!=rootCat && IC.getCategories().indexOf(c)!=-1);
        let targetCategories = await this.askForTargetCategories(allCategories);
        console.log(targetCategories);

        // let's copy and paste with the kids
        let comment = await matrixSession.getCommentAsync();

        let dlg = $("<div>").appendTo($("body"));
        let ui = $("<div style='height:100%;width:100%'><div id='copyProgress'></div></div>");
        ml.UI.showDialog(dlg, "Copying....", ui, $(document).width() * 0.90, 200, [{
                text: 'OK',
                "class": 'btnDoIt',
                click: function () {
                   
                    dlg.dialog("close");
                }
            }], UIToolsEnum.Scroll.Vertical, true, true, function () {
            dlg.remove();
        }, function () {
        }, function () { });


        // prepare the copy
        let newItemsMap:INewItemMap = {};
        for (let root of roots.selection) {
            await this.copyWithChildren( roots.sourceProject , root.to, app.getCurrentItemId(), targetCategories.split(","), newItemsMap, comment, 0);
        } 
    }
    
    // copy the item or folder from the source project to the target
    // copy all (grand) children of the given categories
    // recreate links

    private async copyWithChildren( sourceProject:string , sourceItemOrFolder:string, targetFolder:string, targetCategories:string[], newItemsMap:INewItemMap, comment:string, depth:number):Promise<string> {
        
        $("#copyProgress").prepend(`<div>copying ${sourceItemOrFolder} to ${targetFolder} </div>`);

        // copy the folder or items from source to target
        let newItems = await this.copyItems(sourceProject, sourceItemOrFolder, targetFolder, comment);
        
        $("#copyProgress").prepend(`<div>done. created ${newItems.length} new items: ${newItems.join(",")}</div>`);

        $("#copyProgress").prepend(`<div>getting details about items copied before</div>`);
        // get the source items which just have been copied with all their downlinks
        let sourceItems =  await this.searchItems(sourceProject, sourceItemOrFolder);

        // check that there's as many needles as new items
        if  ( sourceItems.length != newItems.length) {
            $("#copyProgress").prepend(`<div>ERROR: the number of items created in this projects is different than the number in the source. stopping...</div>`);
            ml.UI.showError("unexpected copy result", "the number of items created in this projects is different than the number in the source. stopping...");
            return;
        }  
        // build a map of new item ids to the original ids with downlinks
        for ( let idx=0; idx < newItems.length; idx++) {
            newItemsMap[newItems[idx]] = sourceItems[idx];
        }
        // now we can work on the kids of the items we just created
        // for each item we just created we check if in the source project are links to any items in the target categories
        // if so we check if that item has already be copied an in that case we just link it, 
        // if not we also copy it over and link it

        for ( let idx=0; idx < newItems.length; idx++) {
            $("#copyProgress").prepend(`<div>create/link downlinked items for ${newItems[idx]} </div>`);
            let source = newItemsMap[newItems[idx]];
            for (let dl of source.downLinkList?source.downLinkList:[]) {
                let target = ml.Item.parseRef(dl.itemRef);
                if (targetCategories.indexOf(target.type)!=-1) {
                    // this should be copied
                    let copy = this.wasCopiedBefore(newItemsMap, target.id);
                    if (!copy) {
                        // this was not copied before, so do that recursively
                        copy = await this.copyWithChildren( sourceProject, target.id, "F-"+target.type+"-1", targetCategories, newItemsMap, comment, depth+1 );
                    }
                    if (copy) {
                        // we need a link from newItems[idx] to copy
                        await this.createLink(newItems[idx], copy);
                        $("#copyProgress").prepend(`<div>linked ${newItems[idx]} to ${copy}</div>`);
                    }
                }

            }
        }
      
        if ( !depth ) {
            $("#copyProgress").prepend(`<div>**** done ****</div>`);
        }
        // if there's one item which was copied, return it, if not return nothing
        return new Promise( (resolve, reject) => {
            resolve( newItems.length == 1?newItems[0]:"");
        });
    }

    // check if an item has been copied before... if so returns the new item id
    private wasCopiedBefore( newItemsMap:INewItemMap, sourceId:string ) {
        for( let s in newItemsMap ) {
            if (ml.Item.parseRef(newItemsMap[s].itemOrFolderRef).id == sourceId) {
                return s;
            }
        }
        return null;
    }

    // create a link between two items
    private createLink( fromItem:string, toItem):Promise<void> {
        return new Promise( (resolve, reject) => {
            app.addDownLinkAsync( fromItem, toItem).always( () => {
                resolve();
            });
        });
    }

    // search for items by id or folder
    private searchItems( sourceProject:string, itemOrFolder:string):Promise<XRTrimNeedleItem[]> {
        return new Promise( (resolve, reject) => {
            restConnection.getServer( `${sourceProject}/needle?search=mrql%3A${itemOrFolder.indexOf("F-")==0?"folderm":"id"}%3D%20${itemOrFolder}&links=down&treeOrder=1`).done( (tn:XRTrimNeedle) => {
                resolve( tn.needles );
            });;
        });
    }

    // copy from project to another, return new items (not folders)
    private copyItems( sourceProject:string, itemOrFolder:string, targetFolder:string, comment:string):Promise<string[]> {
        return new Promise( (resolve, reject) => {
            let params = { copyLabels:1, targetFolder:targetFolder, targetProject: matrixSession.getProject(), reason:comment};
            restConnection.postServer( sourceProject + "/copy/" + itemOrFolder, params).done( function( newFolderItems ) {
                console.log( newFolderItems );
                // (return type is not correct in docu/api)
                let newItems = (<any>newFolderItems).itemsAndFoldersCreated.filter( nfo => nfo.indexOf("F-")!=0); //  only interested in created item 
                resolve(newItems);
            });
        });
    }





    // allow to select some items in another project
    private selectSourceItems( ):Promise<ISourceSelection> {
        return new Promise( (resolve, reject) => {

            let st = new ItemSelectionTools();
            let projectShortLabel:string;
    
            // let user select the items
            st.showCrossProjectDialog({
                selectMode:SelectMode.auto,
                linkTypes: [], 
                selectionChange: function (newSelection:IReference[]) {
                    resolve( <ISourceSelection>{ sourceProject:projectShortLabel, selection:newSelection});
                },crossProjectInit: function (psl:string) {
                    projectShortLabel = psl; 
                },
                getSelectedItems: function () {
                    return [];
                },
                selectOptions: null,
                height:600
            });
        });
    }

    // allow to select some categories in another project
    private askForTargetCategories(categories:string[]):Promise<string> {
        return new Promise( (resolve, reject) => {
        
            let catOptions = categories.map( (c) => { return {id:c,label:c,value:c};});

            let input:ILineEditorLine[] = [
                { help:"Categories", type:"select", multiple:true, options: catOptions, value: "", required:false}
            ]; 
            let le = new LineEditorExt();
            
            le.showDialog( "Target Categories", 380, input, (update:ILineEditorLine[]) => {
                resolve( update[0].value );
                return true;
            }); 
            
        });
    }

}

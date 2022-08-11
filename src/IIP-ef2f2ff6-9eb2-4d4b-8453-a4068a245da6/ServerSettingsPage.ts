import { IPluginSettingPage, PluginCore } from "./core/PluginCore";
import { IServerSettings } from "./Interfaces";
import { Plugin } from "./Main";

// eslint-disable-next-line no-unused-vars
    /* server Setting page closure*/
    export function ServerSettingsPage(): IPluginSettingPage<IServerSettings> {
        
        let self: IPluginSettingPage<IServerSettings> = {};
        if (window["ConfigPage"] !== undefined) {
            self = { ...Object.getPrototypeOf(new ConfigPage()) };
        }
        self.settings = () => {
            
            return { ...Plugin.config.customerSettingsPage.defaultSettings, ...PluginCore.getServerSetting(Plugin.config.customerSettingsPage.settingName, {}) }
        };

        /** Customize this method to generate static HTML.  */
        self.getSettingsDOM = (settings: IServerSettings): JQuery => {
            return $(`
                <div class="panel-body-v-scroll fillHeight">
                    <div>
                        This is my customer settings page : ${settings.myServerSetting}

                    </div>
                    <div id="controls"></div>
                </div>
            `);
        };
        /** Customize this method to add dynamic content*/
        self.showSimple = () => {

            self.settingsOriginal = { ...self.settings() };
            self.settingsChanged = { ...self.settingsOriginal };
            let dom = self.getSettingsDOM(self.settingsChanged);
            ml.UI.addTextInput($("#controls",dom), "My server setting", self.settingsChanged, "myServerSetting",self.paramChanged);
            app.itemForm.append(dom);
        };



        self.renderSettingPage = () => {
         
            self.initPage(
                `${Plugin.PLUGIN_NAME} - Server settings`,
                true,
                undefined,
                Plugin.config.customerSettingsPage.help,
                Plugin.config.customerSettingsPage.helpUrl,
                undefined
            );
            self.showSimple();
        };

        self.showAdvanced = () => {
            console.debug("Show advanced clicked");
            self.showAdvancedCode(JSON.stringify(self.settingsChanged), function (newCode: string) {
                self.settingsChanged = JSON.parse(newCode);
                self.paramChanged();
            });
        };
       
        
        self.saveAsync = () => {
            let def = configApp.setServerSettingAsync(Plugin.config.customerSettingsPage.settingName, JSON.stringify(self.settingsChanged));
            def.done(() => {
                self.settingsOriginal = { ...self.settingsChanged };
                self.renderSettingPage();
            })
            return def
        }

        self.paramChanged = () => {
            configApp.itemChanged(JSON.stringify(self.settingsOriginal) != JSON.stringify(self.settingsChanged));
        }
      
     
        return self;
    }

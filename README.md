# matrix-ui-plugin-boilerplate plugin

This plugin adds a menu to folders:
When selected it opens a project/item selection dialog
the user can select the root items from one category
IF more than one category -> error
afterwards the user can select other categories (downlink targets) -
IF on of the categories does not exist locally error

the software builds a list of items to copy, 
all selected root items/folders from the first selection
all downlinked items + all their parent folders (until there is a common root)

all items and folders are copied
all links are create in the target




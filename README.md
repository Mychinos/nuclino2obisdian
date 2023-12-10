# nuclino2obisdian

This is a small commandline application to clone a Nucliono-Workspace into a local filestructure, that can be imported into Obsidian as a Vault.
All in all the parsing should work, though tables can be icky. Also Nuclino allows Links to Collections which Obsidian does not support, since
collections are simply folders here.

## Usage

1. Clone the Repository
2. Run npm i
3. Copy the example.config.ts and rename it to config.ts and edit the Api-Key Field to match your own.
4. Either run "npm run start" [tsc && node ./dist/tools.js] or "npm run tools" [ts-node ./src/tools]
5. Select Clone Workspace
6. You should now see a list of your Workspaces. Select the one you want to clone
7. ???
8. Profit! You should now have your Workspace local under ./Cloned Worksaces/${WORKSPACE_NAME}

## Debug-Command or "How does this work?"

The Debug-Commands are single steps the Script makes to clone a Workspace.
The Parser gets the Data of the selected Workspace. It then itterates over all ChildIds
listed in the Workspace. All NuclinoItems [TextEntries] are added to an itemMap, all Files
of the Item are Downloaded into the Image Folder inside the Dir-Tree and all Collections
are added as an Folder into the Dir-Tree and get passed into the Parsing-Function recursivly
(now taking the Place of the Workspace, itterating all children of the Collection).

After this, the content of all Items in the itemMap is converted from Nuclino to Obsidian Format.
This means that all Tables, Nuclino-Links and -Images are converted into the local Obsidian Format.
Then all Files are written do Disk as Markdown

```
// Nuclino Table

+----------------+-----------------+
| Some Data      |    Other Stuff  |
| Still one Cell |   Fun times     |
+----------------+-----------------+
| Next Row       |                 |
|                |       ...yep    |
+----------------+-----------------+

// Obsidian (or simply Markdown) Tables
// First Row should have headlines, which Nuclino does not have, so they are blank

|     |     |
| --- | --- |
| Some Data </br> Still one Cell | Other Stuff </br> Fun times |
| Next Row | </br> ...yep |


// Nuclino Item-Link
[ITEM_NAME](https://app.nuclino.com/t/b/ITEM_ID)

// Obsidian ItemLink
[[/path/to/Item | DISPLAY_NAME]]

--------------------------------------------------------------

// Nuclino Image-Link
![FILENAME.TYP](<https://files.nuclino.com/files/FILE_ID/FILENAME.TYP>)
![FILENAME.TYP](https://files.nuclino.com/files/FILE_ID/FILENAME.TYP)

//Obsidian Image-Link
![[FILENAME.TYP]]
```


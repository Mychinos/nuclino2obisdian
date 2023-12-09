import { FileHelper, FileWriteRequest } from './fileHelper';
import { NuclinoApi, NUCLINO_ITEM_TYPE, NuclinoCollection, NuclinoCollectionItem, NuclinoDataItem, NuclinoEntry, NuclinoFile, NuclinoItem, NuclinoWorkspace } from './nuclinoApi';
import { BgRed, FgBlue, FgCyan, FgGreen, FgMagenta, FgRed, FgWhite, FgYellow, Reset } from './consoleColors';
import type SLogger from 'simple-node-logger'


//? Nuclino Link fomrat: '[ITEM_NAME](https://app.nuclino.com/t/b/ITEM_ID)'
const linkNameExpr = /(?<!!)\[[a-zA-ZÀ-ȕ0-9\(\)\s:?_.,-]+\]/gm
const linkUrlExpr = /\(https:\/\/[a-zA-ZÀ-ȕ0-9\/:?_.,-]+\)/gm
const linkExpr = /(?<!!)\[[a-zA-ZÀ-ȕ0-9\(\)\s:?_.,-]+\]\(https:\/\/[a-zA-Z0-9\/:?_.,-]+\)/gm
//? Nuclino Img Link Format: '![FILENAME.TYP](<https://files.nuclino.com/files/FILE_ID/FILENAME.TYP>)'
// ? Or: '![FILENAME.TYP](https://files.nuclino.com/files/FILE_ID/FILENAME.TYP)'
const fileNameExpr = /!\[[a-zA-ZÀ-ȕ0-9\\\(\)\s:?_.,-]+\]/gm
const fileUrlExpr = /\([<]{0,1}https:\/\/[a-zA-Z0-9\/:=\s?_.,<>-]+\)/gm
const imgExpr = /!\[[a-zA-ZÀ-ȕ0-9\\\(\)\s:?_.,-]+\]\([<]{0,1}https:\/\/[a-zA-Z0-9\/:=\s?_.,<>-]+[>]{0,1}\)/gm
const namelessImgExpr = /!\[\]\([<]{0,1}https:\/\/[a-zA-Z0-9\/:?_.,<>=\s-]+[>]{0,1}\)/gm

const tableDelimiter = /\+[\-]+\+[\-]+\+/gm

export type Datasets = {
    files: Record<string, NuclinoFile>
    items: Record<string, NuclinoEntry>
    collections: Record<string, NuclinoCollection>
}

export type NuclinoParserOptions = {
    ignoreEntries: boolean
    buildDirTree: boolean
    downloadFilesWhileBuildingDirTree: boolean
    forceOverwriteEntries: boolean
    forceOverwriteFiles: boolean
    fileWriteBatchSize: number
}

const defaultOptions: NuclinoParserOptions = {
    ignoreEntries: false,
    buildDirTree: true,
    downloadFilesWhileBuildingDirTree: true,
    forceOverwriteEntries: false,
    forceOverwriteFiles: false,
    fileWriteBatchSize: 5
}

export class NuclinoParser {
    options: NuclinoParserOptions
    constructor(private api: NuclinoApi, private fileHelper: FileHelper, private log: SLogger.Logger, options: Partial<NuclinoParserOptions> = defaultOptions) {
        this.options = { ...options, ...defaultOptions }
    }


    extractLinkData(content: string) {
        // * Match all Link Format occurences, extract the actually matched sting and then split it into Name, Id and Url
        const links = [...content.matchAll(linkExpr)]
            .map((match) => {
                const matchedString = match[0]
                //! We matched this with the Combined Regex. Could that have matched if the substring does not?
                const nameInBrackets = matchedString.match(linkNameExpr)![0]
                // ? NuclinoUrls add the Query-Parameter n, we need to replace that, so we can get the correct id 
                const urlInBracket = matchedString.match(linkUrlExpr)![0].replace('?n', '')
                const name = nameInBrackets.slice(1, nameInBrackets.length - 1)
                const url = urlInBracket.slice(1, urlInBracket.length - 1)
                const urlParts = url.split('/')
                // * Link Id is the last Part of the Url
                const id = urlParts[urlParts.length - 1]
                return {
                    match: matchedString,
                    name,
                    url: url,
                    id: id
                }
            })
        return links
    }

    // * Match all Img Link Format occurences, extract the actually matched sting and then split it into Name, Id and Url
    extractImageData(content: string) {
        const imgs = [...content.matchAll(imgExpr), ...content.matchAll(namelessImgExpr)]
            .map((match) => {
                const matchedString = match[0]
                //! Name Match may actually be empty, since imagelinks do not neccesarry have a name
                const nameMatch = matchedString.match(fileNameExpr)
                //! We matched this with the Combined Regex. Could that have matched if the substring does not?
                const urlMatch = matchedString.match(fileUrlExpr)!

                const urlInBrackets = urlMatch[0]
                // ? Here we might have an additional '<>' Pair to cut
                const cutLength = urlInBrackets.charAt(1) === '<' ? 2 : 1
                const url = urlInBrackets.slice(cutLength, urlInBrackets.length - cutLength).replace('?n', '')
                const urlParts = url.split('/')
                // ? Some links with empty names (where we extract the name from our url) have queryParameters, we do not want
                let name = urlParts[urlParts.length - 1].split('?')[0]
                if (nameMatch && nameMatch[0]) {
                    const nameInBrackets = nameMatch[0]
                    // ? Here we have an additional '!' to cut
                    name = nameInBrackets.slice(2, nameInBrackets.length - 1)
                }

                return {
                    match: matchedString,
                    fileName: name,
                    // name: nameParts[0],
                    // fileType: nameParts[1],
                    url: url,
                    id: urlParts[urlParts.length - 2].slice(0,)
                }
            })
        return imgs
    }

    replaceLinks(content: string, itemMap: Record<string, NuclinoItem>) {
        const links = this.extractLinkData(content)
        links.forEach((link) => {
            //* It seems that Nuclino links Pdf Files like it links entries... Hope they download via Files
            if (link.match.includes('.pdf')) {
                content = content.replace(link.match, link.name)
                return
            }
            const linkedItem = itemMap[link.id]
            if (!linkedItem) {
                this.log.error('Could not find linked Item: ', link.id, ' in Datasets! Seems to be Collection')
                return
            }
            const obsidianLink = `[[${linkedItem.path}|${link.name}]]`
            content = content.replace(link.match, obsidianLink)
        })
        return content
    }

    replaceImages(content: string, itemMap: Record<string, NuclinoItem>) {
        const imgs = this.extractImageData(content)
        imgs.forEach((link) => {
            const obsidianLink = `![[${link.fileName}]]`
            content = content.replace(link.match, obsidianLink)
        })
        return content
    }

    /**
     * Nuclino Table Example  
     '+------------------------------------------------------------------------------------------------------------------------+-------------------------------------+\n' +
    '|                                                                                                                        |Name: David Martinez                 |\n' +
    '|                                                                                                                        |                                     |\n' +
    '|                                                                                                                        |Alter:38                             |\n' +
    '+------------------------------------------------------------------------------------------------------------------------+-------------------------------------+\n' +
    '|<!-- image display=small -->                                                                                            |                                     |\n' +
    '|![](https://files.nuclino.com/files/e6907581-2b99-4223-8fa0-23a1ca2a386c/9960c58e17de19b4c9b137dea8aecd71.jpg?preview=s)|                                     |\n' +
    '|                                                                                                                        |Attribute:                           |\n' +
    '|                                                                                                                        |Zuständigkeitsbereich: Song Funkytown|\n' +
    '+------------------------------------------------------------------------------------------------------------------------+-------------------------------------+\n' +
     *  
     * 
     */

    /**
     * Obsidian Table Example:
     *  |      | Name: David Martinez  </br> </br> Alter:38 |
     *  | --- | --- |
     * | <!-- image display=small --> </br> ![](URL_SHORT) | </br> </br> Attribute </br> ETC ETC |
     */

    buildObsidianRowSignifier(count = 1){
        let collumnSignifier = '| --- |'
        while(count > 1) {
            collumnSignifier += ' --- |'
        }
        return collumnSignifier
    }

    extractTableData(content: string) {
        //? Our Collums are signified by +------+------+ [variable count of Slashes]
        const matches = [...content.matchAll(tableDelimiter)]
        if (matches.length) {
            const first = matches[0].index!
            const last = matches[matches.length - 1].index! + matches[matches.length - 1][0].length
            //? We cut the Firest and Last Collumn Signifier
            const sub = content.slice(first, last)
            const table: string[][] = [] 
            let rowCount = 1
            const parts = sub.split('\n').map((e) => {
                if (e.charAt(0) === '|') {
                    //? Every cell in this Row is encased by "|"-Signs. 
                    //? Cuting the first and the last we can now split at "|" to get an Array of all Cells 
                    const colls = e.slice(1, e.length - 1).split('|')
                    colls.forEach((col, i) => {
                        table[rowCount - 1][i] 
                        //TODO: Create Obsidian Table Format
                    })
                    return colls
                }
                //? Since we differentiate Rows from Collumn-Signifier-lines by "|" and "+", 
                //? all Entries in "parts" that are not arrays must indicate the start of a new Row
                //? So we exchange it with our Obsidian Table Signifier
                rowCount++
                return this.buildObsidianRowSignifier(rowCount)
            })
            parts.splice(0, 1)
            parts[parts.length - 1] = this.buildObsidianRowSignifier(rowCount)

            console.log(sub)
            //TODO: Convert to Obsidian Plugin Table or think of something else
        }
    }

    replaceLinksAndImagesInContent(_item: NuclinoEntry, itemMap: Record<string, NuclinoItem>) {
        return this.replaceImages(this.replaceLinks(_item.content, itemMap), itemMap)
    }

    normalizeTitle(title: string) {
        return title
            .replace(/\//gm, '-') //? Slashes create Problems, because they get interpeted as Paths
            .replace(/#/, 'Nr.') //? Hashtags get interpreted as Obsidian Tags, which creates Problems if used inside a Link
    }

    async cloneWorkspace(workspace: NuclinoWorkspace) {
        const itemMap = await this.fetchItemListAndBuildDirTree(workspace)
        await this.migrateDirTree(itemMap)
    }

    // ! Suppose i do net realy need the list of Collections and Files later only to migrate all items into the dirtree. Refactoring this to only save the itemslist for now
    // async buildDatasetsAndDirTree(item: NuclinoDataItem, datasets: Datasets = { files: {}, items: {}, collections: {} }, depth = 0, path = '') {
    //* Itterate thorugh our Nuclino-Workspace/Collections recursivly, Download all Files, Get Data of all Items and Build our DirTree by creating a dir for each collection 
    async fetchItemListAndBuildDirTree(coll: NuclinoCollectionItem, itemMap: Record<string, NuclinoItem> = {}, depth = 0, path = '') {
        this.log.info(FgYellow, 'Entering Depth ', depth, FgRed, ' ', path, Reset)
        //* Check if item is Workspace or Collection (NuclinoEntries should not show up here)
        if (coll.object === NUCLINO_ITEM_TYPE.WORKSPACE || coll.object === NUCLINO_ITEM_TYPE.COLLECTION) {
            for (let id of (coll as NuclinoCollectionItem).childIds) {
                const child = await this.api.fetchItem(id)
                //* Fetch Children. If they are an Entry, add them to Dataset and continue
                if (child.object === NUCLINO_ITEM_TYPE.ITEM && !this.options.ignoreEntries) {
                    const itemData = await this.api.fetchItem(child.id) as NuclinoEntry
                    itemData.title = this.normalizeTitle(itemData.title)
                    this.log.info('Depth ', depth, ': Fetched Item: ', FgGreen, itemData.title, ' (', FgBlue, itemData.id + ')', Reset)
                    itemData.path = path + '/' + itemData.title
                    itemMap[itemData.id] = itemData
                    // * Get Metadata of all Files in Entry if there are any
                    if (itemData.contentMeta.fileIds.length) {
                        for (let id of itemData.contentMeta.fileIds) {
                            const file = await this.api.fetchFile(id)
                            this.log.info('Depth', depth, ': Fetched File: ', FgCyan, file.fileName, ' (', FgBlue, file.id + ')', Reset)
                            // datasets.files[file.id] = file
                            if (this.options.downloadFilesWhileBuildingDirTree) {
                                //* We have this here to Download the images while theire downloadlink is still active, 
                                //* since Nuclino only gives us a certain timefime to download an Image after getting its info from the Api 
                                //* The Slowdown on Collecting the ItemData is not a problem since we are most likely going to hit the rate limit anyway
                                this.fileHelper.downloadImageToDisk(file.download.url, file.fileName, this.options.forceOverwriteFiles)
                            }
                        }
                    }
                    continue
                    //* Elsewise add Collection to DirTree and itterate Collection Children 
                } else if (child.object === NUCLINO_ITEM_TYPE.COLLECTION) {
                    child.title = this.normalizeTitle(child.title)
                    this.log.info('Depth', depth, ': Fetched Collection ', FgMagenta, child.title, ' (', FgBlue, child.id + ')', Reset)
                    child.path = path + '/' + child.title
                    itemMap[child.id] = child
                    this.options.buildDirTree && this.fileHelper.ensureDirInBasePathSync(child.path)
                    await this.fetchItemListAndBuildDirTree(child as NuclinoCollection, itemMap, depth++, path + '/' + child.title)
                }
            }
        }
        return itemMap
    }

    async migrateDirTree(itemMap: Record<string, NuclinoItem>) {
        const fileRequests: FileWriteRequest[] = Object.values(itemMap).filter(i => i.object === NUCLINO_ITEM_TYPE.ITEM)
            .map((item) => {
                const req = {
                    content: this.replaceLinksAndImagesInContent(item as NuclinoEntry, itemMap),
                    path: item.path! + '.md'
                }
                return req
            })
        await this.fileHelper.writeFileBatchesIntoDirTree(fileRequests, this.options.fileWriteBatchSize, this.options.forceOverwriteEntries)
    }

}
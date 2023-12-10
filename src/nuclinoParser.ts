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
                if (!name && nameMatch && nameMatch[0]) {
                    //? Nuclino escapes different characters inside the name. We need to unescape them so that obisdian can find the images with theire correct name
                    const nameInBrackets = nameMatch[0].replace('\\', '')
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
            //? If we dont escape the pipe-char the link might break Tabledata
            const obsidianLink = `[[${linkedItem.path}\\|${link.name}]]`
            content = content.replace(link.match, obsidianLink)
        })
        return content
    }

    replaceImages(content: string) {
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

    buildObsidianRowSignifier(count = 1) {
        let collumnSignifier = '| --- |'
        while (count > 1) {
            collumnSignifier += ' --- |'
            count--
        }
        return collumnSignifier
    }


    replaceTableData(content: string) {
        //? Our Collums are signified by +------+------+ [variable count of Slashes]
        const matches = [...content.matchAll(tableDelimiter)]
        if (matches.length) {
            const first = matches[0].index!
            const last = matches[matches.length - 1].index! + matches[matches.length - 1][0].length
            //? Cut the Table from the Content
            const sub = content.slice(first, last)

            const colCutIndices = [...matches[0][0].matchAll(/\+/gm)].map(m => m.index!)
            let rowCount = 0
            const table: Array<Array<string>> = [[]]

            sub.split('\n').forEach((e) => {
                //? Use the first char to see if we have a dataline or a Row-Delimiter
                if (e.charAt(0) === '|') {
                    //? Cut all Colls using the char indices we got from our first Row-Delimiter
                    const colls: string[] = []
                    for (let i = 0; i < colCutIndices.length - 1; i++) {
                        let content = e.slice(colCutIndices[i], colCutIndices[i + 1])
                        if (content.charAt(0) === '|') {
                            content = content.slice(1)
                        }
                        if (content.charAt(content.length - 1) === '|') {
                            content = content.slice(0, content.length - 1)
                        }
                        //
                        colls.push(content.replace(/\|/gm, '\\|'))
                    }
                    if (!table[rowCount - 1]) {
                        table[rowCount - 1] = []
                    }
                    colls.forEach((col, i) => {
                        if (!table[rowCount - 1][i]) {
                            table[rowCount - 1][i] = col.trim()
                            return
                        }
                        table[rowCount - 1][i] += ' </br> ' + col.trim()
                    })
                    return colls
                }
                //? We differentiate Rows from Collumn-Signifier-lines by "|" and "+", 
                rowCount++
            })
            const tableString = table.reduce((tableString, row, i, arr) => {
                const rowString = '| ' + row.join(' | ') + ' |'
                tableString += rowString
                if (i !== arr.length - 1) { tableString += ' \n ' + this.buildObsidianRowSignifier(row.length) + ' \n ' }
                return tableString
            }, '')
            return content.replace(sub, tableString)
        }
        return content
    }

    replaceLinksImagesAndTablesInContent(_item: NuclinoEntry, itemMap: Record<string, NuclinoItem>) {
        console.log('MAP LENGTH', Object.keys(itemMap.keys))
        return this.replaceImages(this.replaceLinks(this.replaceTableData(_item.content), itemMap))
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
                    content: this.replaceLinksImagesAndTablesInContent(item as NuclinoEntry, itemMap),
                    path: item.path! + '.md'
                }
                return req
            })
        await this.fileHelper.writeFileBatchesIntoDirTree(fileRequests, this.options.fileWriteBatchSize, this.options.forceOverwriteEntries)
    }

}
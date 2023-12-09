import { FileHelper, FileWriteRequest } from './fileHelper';
import { NuclinoApi, NUCLINO_ITEM_TYPE, NuclinoCollection, NuclinoCollectionItem, NuclinoDataItem, NuclinoEntry, NuclinoFile, NuclinoItem, NuclinoWorkspace } from './nuclinoApi';
import { FgBlue, FgCyan, FgGreen, FgMagenta, FgRed, FgYellow, Reset } from './consoleColors';
import type SLogger from 'simple-node-logger'
import { UUID } from 'crypto';

//? Nuclino Link fomrat: '[ITEM_NAME](https://app.nuclino.com/t/b/ITEM_ID)'
const linkNameExpr = /(?<!!)\[[a-zA-ZÀ-ȕ0-9 -:?_.,-]+\]/gm
const linkUrlExpr = /\([a-zA-ZÀ-ȕ0-9 -:?_.,-]+\)/gm
const linkExpr = /(?<!!)\[[a-zA-ZÀ-ȕ0-9 -:?_.,-]+\]\([a-zA-ZÀ-ȕ0-9 -:?_.,-]+\)/gm
//? Nuclino Img Link Format: '![FILENAME.TYP](<https://files.nuclino.com/files/FILE_ID/FILENAME.TYP>)'
// ? Or: '![FILENAME.TYP](https://files.nuclino.com/files/FILE_ID/FILENAME.TYP)'
const fileNameExpr = /!\[[a-zA-ZÀ-ȕ0-9 -:?_.,-]+\]/gm
const fileUrlExpr = /\([a-zA-ZÀ-ȕ0-9 -:?_.,<>-]+\)/gm
const imgExpr = /!\[[a-zA-ZÀ-ȕ0-9 -:?_.,-]+\]\([a-zA-ZÀ-ȕ0-9 -:?_.,<>-]+\)/gm


export type Datasets = {
    files: Record<string, NuclinoFile>
    items: Record<string, NuclinoEntry>
    collections: Record<string, NuclinoCollection>
}

export type NuclinoParserOptions = {
    forceOverwriteEntries: boolean
    forceOverwriteImages: boolean
    fileWriteBatchSize: number
}

const defaultOptions: NuclinoParserOptions = {
    forceOverwriteEntries: false,
    forceOverwriteImages: false,
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
                const urlInBrackets = matchedString.match(linkUrlExpr)![0]
                const name = nameInBrackets.slice(1, nameInBrackets.length - 1)
                const url = urlInBrackets.slice(1, urlInBrackets.length - 1)
                // ? NuclinoUrls add the Query-Parameter n, we need to replace that, so we can get the correct id 
                const urlParts = url.replace('?n', '').split('/')
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
        const imgs = [...content.matchAll(imgExpr)]
            .map((match) => {
                const matchedString = match[0]
                //! We matched this with the Combined Regex. Could that have matched if the substring does not?
                const nameMatch = matchedString.match(fileNameExpr)!
                const urlMatch = matchedString.match(fileUrlExpr)!
                const nameInBrackets = nameMatch[0]
                const urlInBrackets = urlMatch[0]
                // ? Here we have an additional '!' to cut
                const name = nameInBrackets.slice(2, nameInBrackets.length - 1)
                // ? Here we might have an additional '<>' Pair to cut
                const cutLength = urlInBrackets.charAt(1) === '<' ? 2 : 1
                const url = urlInBrackets.slice(cutLength, urlInBrackets.length - cutLength)
                const urlParts = url.split('/')
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

    replaceLinks(content: string, itemMap: Record<string, NuclinoEntry>) {
        const links = this.extractLinkData(content)
        links.forEach((link) => {
            const linkedItem = itemMap[link.id]
            if (!linkedItem) {
                this.log.error('Could not find linked Item: ', link.id, ' in Datasets!')
                return
            }
            const obsidianLink = `[[${linkedItem.path}|${link.name}]]`
            content = content.replace(link.match, obsidianLink)
        })
        return content
    }

    replaceImages(content: string, itemMap: Record<string, NuclinoEntry>) {
        const imgs = this.extractImageData(content)
        imgs.forEach((link) => {
            const obsidianLink = `![[${link.fileName}]]`
            content = content.replace(link.match, obsidianLink)
        })
        return content
    }

    replaceLinksAndImagesInContent(_item: NuclinoEntry, itemMap: Record<string, NuclinoEntry>) {
        return this.replaceImages(this.replaceLinks(_item.content, itemMap), itemMap)
    }

    async cloneWorkspace(workspace: NuclinoWorkspace) {
        const itemMap = await this.fetchItemListAndBuildDirTree(workspace)
        await this.migrateDirTree(itemMap)
    }

    // ! Suppose i do net realy need the list of Collections and Files later only to migrate all items into the dirtree. Refactoring this to only save the itemslist for now
    // async buildDatasetsAndDirTree(item: NuclinoDataItem, datasets: Datasets = { files: {}, items: {}, collections: {} }, depth = 0, path = '') {
    //* Itterate thorugh our Nuclino-Workspace/Collections recursivly, Download all Files, Get Data of all Items and Build our DirTree by creating a dir for each collection 
    async fetchItemListAndBuildDirTree(coll: NuclinoCollectionItem, itemMap: Record<string, NuclinoEntry> = {}, depth = 0, path = '') {
        this.log.info(FgYellow, 'Entering Depth ', depth, FgRed, ' ', path, Reset)
        //* Check if item is Workspace or Collection (NuclinoEntries should not show up here)
        if (coll.object === NUCLINO_ITEM_TYPE.WORKSPACE || coll.object === NUCLINO_ITEM_TYPE.COLLECTION) {
            for (let id of (coll as NuclinoCollectionItem).childIds) {
                const child = await this.api.fetchItem(id)
                //* Fetch Children. If they are an Entry, add them to Dataset and continue
                if (child.object === NUCLINO_ITEM_TYPE.ITEM) {
                    const itemData = await this.api.fetchItem(child.id) as NuclinoEntry
                    itemData.title = itemData.title.replace(/\//gm, '-')
                    this.log.info('Depth ', depth, ': Fetched Item: ', FgGreen, itemData.title, ' (', FgBlue, itemData.id + ')', Reset)
                    itemData.path = path + '/' + itemData.title
                    itemMap[itemData.id] = itemData
                    // * Get Metadata of all Files in Entry if there are any
                    if (itemData.contentMeta.fileIds.length) {
                        for (let id of itemData.contentMeta.fileIds) {
                            const file = await this.api.fetchFile(id)
                            this.log.info('Depth', depth, ': Fetched File: ', FgCyan, file.fileName, ' (', FgBlue, file.id + ')', Reset)
                            // datasets.files[file.id] = file
                            //* We have this here to Download the images while theire downloadlink is still active, 
                            //* since Nuclino only gives us a certain timefime to download an Image after getting its info from the Api 
                            //* The Slowdown on Collecting the ItemData is not a problem since we are most likely going to hit the rate limit anyway
                            this.fileHelper.downloadImageToDisk(file.download.url, file.fileName, this.options.forceOverwriteImages)
                        }
                    }
                    continue
                    //* Elsewise add Collection to DirTree and itterate Collection Children 
                } else if (child.object === NUCLINO_ITEM_TYPE.COLLECTION) {
                    child.title = child.title.replace(/\//gm, '-')
                    this.log.info('Depth', depth, ': Fetched Collection ', FgMagenta, child.title, ' (', FgBlue, child.id + ')', Reset)
                    child.path = path + '/' + child.title
                    // datasets.collections[child.id] = child as NuclinoCollection
                    this.fileHelper.ensureDirInBasePathSync(path)
                    await this.fetchItemListAndBuildDirTree(child as NuclinoCollection, itemMap, depth++, path + '/' + child.title)
                }
            }
        }
        return itemMap
    }

    async migrateDirTree(itemMap: Record<string, NuclinoEntry>) {
        const fileRequests: FileWriteRequest[] = Object.values(itemMap).map((itm) => {
            return {
                content: this.replaceLinksAndImagesInContent(itm, itemMap),
                path: itm.path! + '.md'
            }
        })
        await this.fileHelper.writeFileBatchesIntoDirTree(fileRequests, this.options.fileWriteBatchSize, this.options.forceOverwriteEntries)
    }

}
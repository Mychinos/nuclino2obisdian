import fs, { promises as fsAsync } from 'fs'
import { join } from 'path'
import type SLogger from 'simple-node-logger'
import { Readable } from 'stream'
import { finished } from 'stream/promises'

export type FileWriteRequest = {
    content: string,
    path: string
}

export type FileHelperOptions = {
    fileFolderName: string,
    itemMapName: string,
    basePath: string
}

const defaultFileHelperOptions: FileHelperOptions = {
    fileFolderName: 'Files',
    itemMapName: 'itemMap.json',
    basePath: join(__dirname, '..', 'Cloned Workspaces')
}

export class FileHelper {
    basePath: string
    options: FileHelperOptions
    constructor(private log: SLogger.Logger, options = defaultFileHelperOptions) {
        this.options = { ...defaultFileHelperOptions, ...options }
        this.basePath = this.options.basePath
    }

    async downloadImageToDisk(url: string, fileName: string, forceOverwrite = false) {
        return this.downloadFileToDisk(url, join(this.options.fileFolderName, fileName), forceOverwrite)
    }

    async downloadFileToDisk(url: string, filePath: string, forceOverwrite = false) {
        const fileRes = await fetch(url)
        const destination = join(this.basePath, filePath)
        if (forceOverwrite || !fs.existsSync(destination)) {
            const fileStream = fs.createWriteStream(destination, { flags: 'wx' })
            if (!fileRes.body) {
                throw new Error()
            }
            // @ts-ignore TS says ReadableSteam<UInt8Array> can not be used as ReadableStream<any>. Why beats me. At the time of writing this, this code works 
            await finished(Readable.fromWeb(fileRes.body).pipe(fileStream))
        }
    }

    async writeFileContentToDisk(content: string, filePath: string, forceOverwrite = false) {
        const destination = join(this.basePath, filePath)
        if (forceOverwrite || !fs.existsSync(filePath)) {
            return fsAsync.writeFile(destination, content, { encoding: 'utf-8' })
        }
        return
    }

    async writeFileBatchesIntoDirTree(files: FileWriteRequest[], batchSize = 10, forceOverwrite = false) {
        const workingBatch: Promise<void>[] = []
        for (let file of files) {
            workingBatch.push(this.writeFileContentToDisk(file.content, file.path, forceOverwrite).catch((err) => {
                throw new Error(err)
            }))
            if (workingBatch.length >= batchSize) {
                await Promise.all(workingBatch)
            }
        }
    }

    async writeItemMapToBaseDir(itemMap: any) {
        return fsAsync.writeFile(join(this.basePath, this.options.itemMapName), JSON.stringify(itemMap), { encoding: 'utf-8' })
    }

    async loadItemMapIfExists() {
        const json = await fsAsync.readFile(join(this.basePath, this.options.itemMapName), { encoding: 'utf-8' })
        return JSON.parse(json) as any
    }

    setBaseDir(basePath: string) {
        this.basePath = basePath
        const parts = basePath.split('/')
        let path = '/'
        for (const part of parts) {
            path = join(path, part)
            this.ensureDirSync(path)
        }
        //* Make Sure Image Folder exists
        this.ensureDirSync(join(path, this.options.fileFolderName))
    }

    ensureDirSync(path: string) {
        if (!fs.existsSync(path)) {
            fs.mkdirSync(join(path))
        }
    }

    ensureDirInBasePathSync(path: string) {
        this.ensureDirSync(join(this.basePath, path))
    }

}
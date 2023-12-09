//* Config file writes all config into process.env so we only need to i
import { UUID } from 'crypto'
import cfg from './config'
import { FgRed, Reset } from './consoleColors'
import type SLogger from 'simple-node-logger'


export enum NUCLINO_ITEM_TYPE {
    WORKSPACE = "workspace",
    COLLECTION = "collection",
    ITEM = "item",
    FILE = "file"
}

export type NuclinoBaseItem = {
    object: NUCLINO_ITEM_TYPE.COLLECTION | NUCLINO_ITEM_TYPE.ITEM,
    id: UUID,
    workspaceId: UUID
    url: string
    title: string
    createdAt: string
    createdUserId: UUID
    lastUpdatedAt: string
    lastUpdatedUserId: UUID
    path?: string //! This is a custom Property we will later use to find where an item is positioned
}

export type NuclinoWorkspace = {
    object: NUCLINO_ITEM_TYPE.WORKSPACE
    id: UUID
    teamId: UUID
    name: string
    createdAt: string
    createdUserId: UUID
    fields: any[]
    childIds: UUID[]
}

export type NuclinoGetResponse<ITM> = {
    status: 'success',
    data: ITM
}

export type NuclinoListResponse<ITM> = {
    status: 'success',
    data: {
        object: string,
        results: ITM[]
    }
}

export type NuclinoErrorResponse = {
    status: 'fail'
    message: string
}

export type NuclinoCollection = NuclinoBaseItem & {
    childIds: UUID[]
}

export type NuclinoEntry = NuclinoBaseItem & {
    fields: any //* An object mapping field names to field values (see https://help.nuclino.com/687c1d13-fields)
    content: string //* The content of the item formatted as Markdown (see https://help.nuclino.com/4adea846-item-content-format).
    contentMeta: {
        itemIds: UUID[] //* An array of IDs of all the items and collections that appear inside the content.
        fileIds: UUID[] //* An array of IDs of all the files that appear inside the content.
    }
}
export type NuclinoItem = NuclinoEntry | NuclinoCollection

export type NuclinoDataItem = NuclinoWorkspace | NuclinoItem

export type NuclinoCollectionItem = NuclinoWorkspace | NuclinoCollection

export type NuclinoFile = {
    object: NUCLINO_ITEM_TYPE.FILE
    id: UUID
    itemId: UUID
    fileName: string
    createdAt: string
    createdUserId: UUID
    download: {
        url: string
        expiresAt: string
    }
}

export type GetItemFilter = {
    workspaceId?: UUID,
    teamId?: UUID,
    after?: UUID,
    limit?: number
}

export class NuclinoApi {

    NuclinoBasePath = "https://api.nuclino.com/v0"
    AuthHeader = this.createAuthHeader()
    constructor(private log: SLogger.Logger) {

    }

    createAuthHeader() {
        return {
            Authorization: cfg.NUCLINO_API_KEY
        }
    }

    async fetchWorkspaces(limit?: number): Promise<NuclinoWorkspace[]> {
        const limitString = limit ? `?limit=${limit}` : ''
        const url = `${this.NuclinoBasePath}/workspaces${limitString}`
        const result = await (await fetch(url, { headers: this.AuthHeader })).json() as NuclinoListResponse<NuclinoWorkspace> | NuclinoErrorResponse
        if (result.status === 'fail') {
            if (result.message === "You've made too many requests and hit a rate limit") {
                this.log.info(FgRed, 'Hit Rate Limit. Waiting 30 Secs', Reset)
                await this.wait(30_000)
                return this.fetchWorkspaces(limit)
            }
            throw new Error(`Could not fetch Workspace: ${result.message}`)
        }
        const res = result as NuclinoListResponse<NuclinoWorkspace>
        if (!res.data.results) { this.log.info(result) }
        return res.data.results
    }


    getFetchItemUrl({ workspaceId, teamId, after, limit }: GetItemFilter) {
        let url = `${this.NuclinoBasePath}/items`
        if (workspaceId && teamId) {
            throw new Error('WorkspaceId and TeamId set as filter. Only one is permited')
        }
        if (workspaceId || teamId || after || limit) {
            url = url += '?'
            // * If / Else because only one can be set
            if (workspaceId) {
                url += `workspaceId=${workspaceId}`
            } else if (teamId) {
                url += `teamId=${teamId}`
            }
            if (after) {
                url += `after=${after}`
            }
            if (limit) {
                url += `limit=${limit}`
            }
        }
        return url
    }

    async fetchItems(filter: GetItemFilter): Promise<NuclinoItem[]> {
        const url = this.getFetchItemUrl(filter)
        const results = await (await fetch(url, { headers: this.AuthHeader })).json() as NuclinoListResponse<NuclinoItem> | NuclinoErrorResponse
        if (results.status === 'fail') {
            if (results.message === "You've made too many requests and hit a rate limit") {
                this.log.info(FgRed, 'Hit Rate Limit. Waiting 30 Secs', Reset)
                await this.wait(30_000)
                return this.fetchItems(filter)
            }
            throw new Error(`Could not fetch Items: ${results.message}`)
        }
        if (!results.data.results) { this.log.info(results) }
        return results.data.results

    }

    async fetchItem(id: UUID): Promise<NuclinoItem> {
        const url = `${this.NuclinoBasePath}/items/${id}`
        const result = await (await fetch(url, { headers: this.AuthHeader })).json() as NuclinoGetResponse<NuclinoItem> | NuclinoErrorResponse
        if (result.status === 'fail') {
            if (result.message === "You've made too many requests and hit a rate limit") {
                this.log.info(FgRed, 'Hit Rate Limit. Waiting 30 Secs', Reset)
                await this.wait(30_000)
                return this.fetchItem(id)
            }
            throw new Error(`Could not fetch Item: ${result.message}`)
        }
        return result.data
    }



    async fetchFile(id: UUID): Promise<NuclinoFile> {
        const url = `${this.NuclinoBasePath}/files/${id}`
        const result = await (await fetch(url, { headers: this.AuthHeader })).json() as NuclinoGetResponse<NuclinoFile> | NuclinoErrorResponse
        if (result.status === 'fail') {
            if (result.message === "You've made too many requests and hit a rate limit") {
                this.log.info(FgRed, 'Hit Rate Limit. Waiting 30 Secs', Reset)
                await this.wait(30_000)
                return this.fetchFile(id)
            }
            throw new Error(`Could not fetch file: ${result.message}`)
        }
        return result.data

    };

    wait(ms: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms)
        })
    }
}


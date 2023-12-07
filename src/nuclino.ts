//* Config file writes all config into process.env so we only need to i
import { UUID } from 'crypto'
import cfg from './config'
import { FgRed, Reset } from './consoleColors'

const NuclinoBasePath = "https://api.nuclino.com/v0"
const AuthHeader = createAuthHeader()

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

export function createAuthHeader() {
    return {
        Authorization: cfg.NUCLINO_API_KEY
    }
}

export async function fetchWorkspaces(limit?: number) {
    const limitString = limit ? `?limit=${limit}` : ''
    const url = `${NuclinoBasePath}/workspaces${limitString}`
    const result = await (await fetch(url, { headers: AuthHeader })).json() as NuclinoListResponse<NuclinoWorkspace> | NuclinoErrorResponse
    if (result.status === 'fail') {
        if (result.message === "You've made too many requests and hit a rate limit") {
            console.log(FgRed,'Hit Rate Limit. Waiting 30 Secs',Reset)
            await wait(30_000)
            return fetchWorkspaces(limit)
        }
        throw new Error(`Could not fetch Workspace: ${result.message}`)
    }
    const res = result as NuclinoListResponse<NuclinoWorkspace>
    if (!res.data.results) { console.log(result) }
    return res.data.results
}


function getFetchItemUrl({ workspaceId, teamId, after, limit }: GetItemFilter) {
    let url = `${NuclinoBasePath}/items`
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

export async function fetchItems(filter: GetItemFilter) {
    const url = getFetchItemUrl(filter)
    const results = await (await fetch(url, { headers: AuthHeader })).json() as NuclinoListResponse<NuclinoItem> | NuclinoErrorResponse
    if (results.status === 'fail') {
        if (results.message === "You've made too many requests and hit a rate limit") {
            console.log(FgRed,'Hit Rate Limit. Waiting 30 Secs',Reset)
            await wait(30_000)
            fetchItems(filter)
        }
        throw new Error(`Could not fetch Items: ${results.message}`)
    }
    if (!results.data.results) { console.log(results) }
    return results.data.results

}

export async function fetchItem(id: UUID) {
    const url = `${NuclinoBasePath}/items/${id}`
    const result = await (await fetch(url, { headers: AuthHeader })).json() as NuclinoGetResponse<NuclinoItem> | NuclinoErrorResponse
    if (result.status === 'fail') {
        if (result.message === "You've made too many requests and hit a rate limit") {
            console.log(FgRed,'Hit Rate Limit. Waiting 30 Secs',Reset)
            await wait(30_000)
            return fetchItem(id)
        }
        throw new Error(`Could not fetch Item: ${result.message}`)
    }
    if (!result.data) { console.log(result) }
    return result.data
}



export async function fetchFile(id: UUID) {
 
        const url = `${NuclinoBasePath}/files/${id}`
        const result = await (await fetch(url, { headers: AuthHeader })).json() as NuclinoGetResponse<NuclinoFile> | NuclinoErrorResponse
        if (result.status === 'fail') {
            if (result.message === "You've made too many requests and hit a rate limit") {
                console.log(FgRed,'Hit Rate Limit. Waiting 30 Secs',Reset)
                await wait(30_000)
                return fetchFile(id)
            }
            throw new Error(`Could not fetch file: ${result.message}`)
        }

        if (!result.data) { console.log(result) }
        return result.data

};

export function wait(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

// (async () => {
//     console.log((await fetchItem('296c2fca-7ba1-4e3c-9b20-d1509355d6c4')))
//     // console.log((await fetchFile('ccecfcc2-0731-4b07-aa92-cbad6f85b0a5')))
//     // (await fetchItems({workspaceId: 'b6df8ed9-df3c-4520-add6-1d699c41d96f'})).map((i) => {
//     //     if((i as NuclinoEntry).contentMeta?.fileIds.length) {
//     //         console.log(i)
//     //     }
//     // })
// })()
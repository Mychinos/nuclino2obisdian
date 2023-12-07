//* Config file writes all config into process.env so we only need to i
import { UUID } from 'crypto'
import cfg from './config'

const NuclinoBasePath = "https://api.nuclino.com/v0"
const AuthHeader = createAuthHeader()

export enum NUCLINO_ITEM_TYPE {
    WORKSPACE = "workspace",
    COLLECTION = "collection",
    ITEM = "item"
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

export type NuclinoWorkSpace = {
    object: NUCLINO_ITEM_TYPE.WORKSPACE
    id: UUID
    teamId: UUID
    name: string
    createdAt: string
    createdUserId: UUID
    fields: any[]
    childIds: UUID[]
}

export type NuclinoListResponse<ITM> = {
    status: string,
    data: {
        object: string,
        results: ITM[]
    }
}

export type Collection = NuclinoBaseItem & {
    childIds: UUID[]
}

export type Item = NuclinoBaseItem & {
    fields: any //* An object mapping field names to field values (see https://help.nuclino.com/687c1d13-fields)
    content: string //* The content of the item formatted as Markdown (see https://help.nuclino.com/4adea846-item-content-format).
    contentMeta: {
        itemIds: UUID[] //* An array of IDs of all the items and collections that appear inside the content.
        fileIds: UUID[] //* An array of IDs of all the files that appear inside the content.
    }
}
export type NuclinoItem = Item | Collection

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
    const result = await (await fetch(url, { headers: AuthHeader })).json() as NuclinoListResponse<NuclinoWorkSpace>
    return result.data.results
}


function getFetchItemUrl({ workspaceId, teamId, after, limit }: GetItemFilter) {
    let url = `${NuclinoBasePath}/v0/items`
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
    const results = await (await fetch(url, { headers: AuthHeader })).json() as NuclinoListResponse<NuclinoItem>
    return results
}

export async function fetchItem(id: UUID) {
    const url = `${NuclinoBasePath}/v0/items/${id}`
    const result = await (await fetch(url, {headers: AuthHeader})).json() as NuclinoItem
    return result
}
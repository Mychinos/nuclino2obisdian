import { UUID } from 'crypto';
// @ts-ignore
import { prompt, Select } from 'enquirer'
import SLogger, { STANDARD_LEVELS } from 'simple-node-logger'
import { NUCLINO_ITEM_TYPE, NuclinoApi, NuclinoCollection, NuclinoCollectionItem, NuclinoEntry, NuclinoFile, NuclinoItem, NuclinoWorkspace } from './nuclinoApi';
import cfg from './config'
import { FgBlue, FgGreen, FgMagenta, FgRed, FgYellow, Reset } from './consoleColors';
import { NuclinoParser, Datasets } from './nuclinoParser';
import { FileHelper } from './fileHelper';
import { join } from 'path';
import * as fs from 'fs'

const log = SLogger.createSimpleLogger()
log.setLevel(cfg.LOG_LEVEL as STANDARD_LEVELS)

const api = new NuclinoApi(log)

enum KNOWN_CMDS {
    LIST_WORKSPACES = "List Workspaces",
    FIND_WORKSPACE = "Find WorkspaceId by Name",
    CLONE_WORKSPACE = "Clone Workspace",
    FETCH_LOCAL_JSON_DUMB = "Fetch Copy of Workspace Data as Json",
    DEBUG_CMDS = "Debug Commands"
}

const CMDS: Record<string, () => Promise<void>> = {
    [KNOWN_CMDS.LIST_WORKSPACES]: listWorkSpaces,
    [KNOWN_CMDS.FIND_WORKSPACE]: findWorkspaceByName,
    [KNOWN_CMDS.CLONE_WORKSPACE]: cloneWorkspace,
    [KNOWN_CMDS.FETCH_LOCAL_JSON_DUMB]: fetchAndDumbToJson,
    [KNOWN_CMDS.DEBUG_CMDS]: execDbgCmd
}

const cmdPrompt = new Select({
    name: "CMD",
    message: "What can i do for you?",
    choices: Object.keys(CMDS)
});

// ? Self executing async Main Function
(async () => {
    if (!cfg.NUCLINO_API_KEY) {
        log.warn('Could not get Nuclino ApiKey from Config. Tools will not work without')
        process.exit(0)
    } else if (cfg.NUCLINO_API_KEY === "YOUR_API_KEY") {
        log.warn('Default ApiKey detected. Please set your own: Tools will not work without')
        process.exit(0)
    }
    const cmdIndex = (await cmdPrompt.run()) as string
    if (CMDS[cmdIndex]) {
        await CMDS[cmdIndex]()
    } else {
        console.error('Whut? How dis happen?')
    }
})()

async function listWorkSpaces() {
    const workspaces = await api.fetchWorkspaces()
    const printable = workspaces.map((w) => { return { name: w.name, id: w.id, teamId: w.teamId } })
    console.table(printable)
}

async function findWorkspaceByName() {
    const res = await prompt({
        type: 'input',
        name: 'name',
        message: "What is the name of the Workspace",
    }) as { name: string }
    const workspaces = await api.fetchWorkspaces()
    console.log(workspaces.find((w) => w.name === res.name || w.name.includes(res.name)))
}

async function selectWorkspace() {
    const workspaces = await api.fetchWorkspaces()
    const wsPrompt = new Select({
        name: "WORKSPACES",
        message: "Which Workspace do you want to clone?",
        choices: workspaces.map(w => { return { name: `${FgMagenta} ${w.name} ${Reset}(${FgBlue}${w.id}${Reset})`, value: w.id } }),
        result: function res() {
            //! @ts-ignore Enquirer ignores the value Property, so we have to define a result Fn in which we manualy return it
            return this.focused.value
        }

    });
    const id = await wsPrompt.run()
    const workspace = workspaces.find(w => w.id === id)
    if (!workspace) {
        throw new Error('Could not find Selected Workspace in Workspace list... how did you select something that is not in the selection list... like srsly?')
    }
    return workspace
}

type WorkspaceDataset = { workspace: NuclinoWorkspace, items: Record<UUID, NuclinoEntry>, collections: Record<UUID, NuclinoCollection> }

async function fetchAndDumbToJson() {
    const workspace = await selectWorkspace()
    const fileHelper = new FileHelper(log)
    fileHelper.setBaseDir(join(__dirname, '..', 'Json Copy', workspace.name))
    const dataset: WorkspaceDataset = { workspace, items: {}, collections: {} }
    await getDataRecursivly(workspace, dataset, { count: 0 })
    await fileHelper.writeItemMapToBaseDir(dataset)
    console.log(FgGreen, 'All Done!')
}

async function getDataRecursivly(collection: NuclinoCollectionItem, dataset: WorkspaceDataset, proc: { count: number }) {
    for (const id of collection.childIds) {
        const item = await api.fetchItem(id)
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(`${FgGreen}Fetched item ${FgYellow}${proc.count++}: ${FgMagenta}${id}${Reset}`)
        if (item.object === NUCLINO_ITEM_TYPE.ITEM) {
            dataset.items[item.id] = item as NuclinoEntry
        } else {
            dataset.collections[item.id] = item as NuclinoCollection
            await getDataRecursivly(item as NuclinoCollection, dataset, proc)
        }
    }
    return dataset
}

async function cloneWorkspace() {
    const workspace = await selectWorkspace()
    log.info('Start Building Datasets')
    const fileHelper = new FileHelper(log)
    fileHelper.setBaseDir(join(__dirname, '..', 'Cloned Workspaces', workspace.name))
    const parser = new NuclinoParser(api, fileHelper, log)
    parser.cloneWorkspace(workspace)
    log.info('All Done')
}


export enum KNOWN_DBG_CMDS {
    BUILD_DIR_TREE = "Build Directory-Tree",
    CREATE_LOCAL_ITEMMAP = "Create Local ItemMap",
    PREPARE_LOCAL_DATA = "Prepare Local Data (Build DirTree + Create ItemMap)",
    MIGRATE_FROM_LOCAL_ITEMMAP = "Migrate from local ItemMap",
    FETCH_FILE = "Fetch File",
    PARSE_TO_UM = "Parse to Um"
}

const DBG_CMDS: Record<string, () => Promise<void>> = {
    [KNOWN_DBG_CMDS.BUILD_DIR_TREE]: buildDirTree,
    [KNOWN_DBG_CMDS.CREATE_LOCAL_ITEMMAP]: createLocalItemMap,
    [KNOWN_DBG_CMDS.PREPARE_LOCAL_DATA]: prepareLocalData,
    [KNOWN_DBG_CMDS.MIGRATE_FROM_LOCAL_ITEMMAP]: migrateFromLocalItemMap,
    [KNOWN_DBG_CMDS.FETCH_FILE]: fetchFile,
    [KNOWN_DBG_CMDS.PARSE_TO_UM]: parseToUmDbFormat
}

const dbgPrompt = new Select({
    name: "DBG",
    message: "Which one?",
    choices: Object.keys(DBG_CMDS)
});

async function execDbgCmd() {
    const cmdIndex = (await dbgPrompt.run()) as string
    if (DBG_CMDS[cmdIndex]) {
        await DBG_CMDS[cmdIndex]()
    } else {
        console.error('Whut? How dis happen?')
    }
}

async function buildDirTree() {
    const workspace = await selectWorkspace()
    log.info('Building DirTree')
    const fileHelper = new FileHelper(log)
    fileHelper.setBaseDir(join(__dirname, '..', 'Cloned Workspaces', workspace.name))
    const parser = new NuclinoParser(api, fileHelper, log, { ignoreEntries: true, downloadFilesWhileBuildingDirTree: false })
    parser.fetchItemListAndBuildDirTree(workspace)
}

async function createLocalItemMap() {
    const workspace = await selectWorkspace()
    log.info('Getting Local Dump of ItemMap')
    const fileHelper = new FileHelper(log)
    fileHelper.setBaseDir(join(__dirname, '..', 'Cloned Workspaces', workspace.name))
    const parser = new NuclinoParser(api, fileHelper, log, { buildDirTree: false, downloadFilesWhileBuildingDirTree: false })
    const itemMap = await parser.fetchItemListAndBuildDirTree(workspace)
    await fileHelper.writeItemMapToBaseDir(itemMap)
}

async function prepareLocalData() {
    const workspace = await selectWorkspace()
    log.info('Getting Local Dump of ItemMap')
    const fileHelper = new FileHelper(log)
    fileHelper.setBaseDir(join(__dirname, '..', 'Cloned Workspaces', workspace.name))
    const parser = new NuclinoParser(api, fileHelper, log, { downloadFilesWhileBuildingDirTree: false })
    const itemMap = await parser.fetchItemListAndBuildDirTree(workspace)
    await fileHelper.writeItemMapToBaseDir(itemMap)
}

async function migrateFromLocalItemMap() {
    const workspace = await selectWorkspace()
    const fileHelper = new FileHelper(log)
    const basePath = join(__dirname, '..', 'Cloned Workspaces', workspace.name)
    fileHelper.setBaseDir(basePath)
    const itemMap = await fileHelper.loadItemMapIfExists()
    if (itemMap) {
        const parser = new NuclinoParser(api, fileHelper, log, { buildDirTree: false, downloadFilesWhileBuildingDirTree: false, forceOverwriteEntries: true })
        parser.migrateDirTree(itemMap)
    } else {
        log.info(`${FgRed} ItemMap does not exist for Workspace ${workspace.name} at path ${basePath}. Consider creating it via the DBG_CMD`)
        process.exit(0)
    }
}

export type UmItem = {
    children: []
    content: string
    image: string
    images: string[]
    name: string
    tags: string[]
    type: string
    path: string[]
}


const ImageBaseUrl = "https://storage.googleapis.com/bedlam/images/"
async function parseToUmDbFormat() {
    // console.log(join(__dirname, 'test.json'))
    // const workspace = await selectWorkspace()
    // log.info('Start Building Datasets')
    // const fileHelper = new FileHelper(log)
    // fileHelper.setBaseDir(join(__dirname, '..', 'Cloned Workspaces', workspace.name))
    // const parser = new NuclinoParser(api, fileHelper, log)
    // const itemMap = JSON.parse(fs.readFileSync(join(process.cwd(), 'map.json'), { encoding: 'utf-8' }))
    // const data = parser.parseItemData(itemMap as any)
    // console.log(data)
    // fs.writeFileSync(join(process.cwd(), 'test.json'), JSON.stringify(data, null, 2), { encoding: 'utf-8' })
    const types: {[key: string]: boolean} = {}

    const itemMap = JSON.parse(fs.readFileSync(join(process.cwd(), 'test.json'), { encoding: 'utf-8' })) as (NuclinoItem & { parsedContent: string, path: string })[]
    for (let item of itemMap) {
        if (item.path.charAt(0) === '/') {
            item.path = item.path.substring(1, item.path.length)
        }
        const path = item.path.split('/')
        const umItem: UmItem = {
            children: [],
            content: item.parsedContent,
            image: '',
            images: [],
            name: item.title,
            tags: [],
            path,
            type: path[0]
        }
        types[path[0]] = true
        const imageExpr = item.parsedContent.match(/!\[\[[\w\/:?_.,<>=\s-]+\]\]/gm)
        if (imageExpr) {
            umItem.images = imageExpr.map((e) => ImageBaseUrl + e.substring(3, e.length - 2))
            umItem.image = umItem.images[0]
        }
        // await uploadItem(umItem)
        console.log(types)
    }
}
import fb from './firebase'
import * as admin from 'firebase-admin'
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            clientEmail: fb.client_email,
            privateKey: fb.private_key,
            projectId: fb.project_id
        })
    })
}
async function uploadItem(item: any) {
    const a = await admin.firestore().collection('/bedlam_entity').add(item)
    console.log(a)
}

async function fetchFile() {
    const res = await prompt({
        type: 'input',
        name: 'name',
        message: "Id of the File?",
    }) as { name: UUID }
    console.log((await api.fetchItem(res.name)))
}

//TODO: Find out how to get missing Items (which are probably linked datasets...)

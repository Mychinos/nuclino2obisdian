// @ts-ignore
import { prompt, Select } from 'enquirer'
import SLogger, { STANDARD_LEVELS } from 'simple-node-logger'
import { NuclinoApi, NuclinoFile } from './nuclinoApi';
import cfg from './config'
import { FgBlue, FgMagenta, FgRed, Reset } from './consoleColors';
import { NuclinoParser } from './nuclinoParser';
import { FileHelper } from './fileHelper';
import { join } from 'path';

const log = SLogger.createSimpleLogger()
log.setLevel(cfg.LOG_LEVEL as STANDARD_LEVELS)

const api = new NuclinoApi(log)

enum KNOWN_CMDS {
    LIST_WORKSPACES = "List Workspaces",
    FIND_WORKSPACE = "Find WorkspaceId by Name",
    CLONE_WORKSPACE = "Clone Workspace",
    DEBUG_CMDS = "Debug Commands"
}

const CMDS: Record<string, () => Promise<void>> = {
    [KNOWN_CMDS.LIST_WORKSPACES]: listWorkSpaces,
    [KNOWN_CMDS.FIND_WORKSPACE]: findWorkspaceByName,
    [KNOWN_CMDS.CLONE_WORKSPACE]: cloneWorkspace,
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
    MIGRATE_FROM_LOCAL_ITEMMAP = "Migrate from local ItemMap"
}

const DBG_CMDS: Record<string, () => Promise<void>> = {
    [KNOWN_DBG_CMDS.BUILD_DIR_TREE]: buildDirTree,
    [KNOWN_DBG_CMDS.CREATE_LOCAL_ITEMMAP]: createLocalItemMap,
    [KNOWN_DBG_CMDS.PREPARE_LOCAL_DATA]: prepareLocalData,
    [KNOWN_DBG_CMDS.MIGRATE_FROM_LOCAL_ITEMMAP]: migrateFromLocalItemMap
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


//TODO: Parse Nameless Image Links ![](<https://files.nuclino.com/files/5b2c3a69-b009-4abc-812e-a60664171619/House of Usher - Orodo Nocturnal X Sanguine.jpg?preview=s>)
//TODO: Find out why this did not parse: |![Locksley Tragedy.jpg](<https://files.nuclino.com/files/7c8277ae-0859-4ca6-95f2-1e504e9ce70e/Locksley Tragedy.jpg>)|<br>                  
//TODO: Find out how to fix Tables
//TODO: Find out why Datasets do still not show up in items
//TODO: Find out why David Martinez File is missing
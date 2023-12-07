// @ts-ignore
import { prompt, Select } from 'enquirer'
import SLogger, { STANDARD_LEVELS } from 'simple-node-logger'
import { fetchFile, fetchItem, fetchWorkspaces, NUCLINO_ITEM_TYPE, NuclinoCollection, NuclinoCollectionItem, NuclinoDataItem, NuclinoEntry, NuclinoFile, NuclinoItem, NuclinoWorkspace } from './nuclino';
import cfg from './config'
import { FgBlue, FgCyan, FgGreen, FgMagenta, FgYellow, Reset } from './consoleColors';

const log = SLogger.createSimpleLogger()
log.setLevel(cfg.LOG_LEVEL as STANDARD_LEVELS)

type Datasets = {
    files: Record<string, NuclinoFile>
    items: Record<string, NuclinoEntry>
    collections: Record<string, NuclinoCollection>
}


enum KNOWN_CMDS {
    LIST_WORKSPACES = "List Workspaces",
    FIND_WORKSPACE = "Find WorkspaceId by Name",
    CLONE_WORKSPACE = "Clone Workspace"
}

const CMDS: Record<string, () => Promise<void>> = {
    [KNOWN_CMDS.LIST_WORKSPACES]: listWorkSpaces,
    [KNOWN_CMDS.FIND_WORKSPACE]: findWorkspaceByName,
    [KNOWN_CMDS.CLONE_WORKSPACE]: cloneWorkspace
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
    const workspaces = await fetchWorkspaces()
    const printable = workspaces.map((w) => { return { name: w.name, id: w.id, teamId: w.teamId } })
    console.table(printable)
}

async function findWorkspaceByName() {
    const res = await prompt({
        type: 'input',
        name: 'name',
        message: "What is the name of the Workspace",
    }) as { name: string }
    const workspaces = await fetchWorkspaces()
    console.log(workspaces.find((w) => w.name === res.name || w.name.includes(res.name)))
}

async function selectWorkspace() {
    const workspaces = await fetchWorkspaces()
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
    const { files, items, collections } = await buildDatasets(workspace)

    //TODO: Use Datasets to Fix ImageLinks and References
    // TODO: Check how to write collections
    //TODO: Write all entries to .MD files and Images to Disk
}

async function buildDatasets(item: NuclinoDataItem, datasets: Datasets = { files: {}, items: {}, collections: {} }, depth = 0) {
    log.info(FgYellow,'Entering Depth ', depth, Reset)
    //* Check if item is Workspace or Collection (NuclinoEntries should not show up here)
    if (item.object === NUCLINO_ITEM_TYPE.WORKSPACE || item.object === NUCLINO_ITEM_TYPE.COLLECTION) {
        for (let id of (item as NuclinoCollectionItem).childIds) {
            const child = await fetchItem(id)
            //* Fetch Children. If they are an Entry, add them to Dataset and continue
            if (child.object === NUCLINO_ITEM_TYPE.ITEM) {
                const itemData = await fetchItem(child.id) as NuclinoEntry
                if (!itemData.title) {
                    console.log(itemData)
                }
                log.info('Depth ', depth, ': Fetched Item: ', FgGreen, itemData.title, ' (', FgBlue, itemData.id + ')', Reset)
                datasets.items[itemData.id] = itemData
                if (itemData.contentMeta.fileIds.length) {
                    for (let id of itemData.contentMeta.fileIds) {
                        const file = await fetchFile(id)
                        log.info('Depth', depth, ': Fetched File: ', FgCyan, file.fileName, ' (', FgBlue, file.id + ')', Reset)
                        datasets.files[file.id] = file
                    }
                }
                continue
                //* Elsewise add Collection to Dataset and itterate Collection Children 
            } else if (child.object === NUCLINO_ITEM_TYPE.COLLECTION) {
                log.info('Depth', depth, ': Fetched ', FgMagenta, child.title, ' (', FgBlue, child.id + ')', Reset)
                datasets.collections[child.id] = child as NuclinoCollection
                await buildDatasets(child, datasets, depth++)
            }
        }
    }
    return datasets
}


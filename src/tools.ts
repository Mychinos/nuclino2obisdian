// @ts-ignore
import { prompt, Select } from 'enquirer'
import SLogger, { STANDARD_LEVELS } from 'simple-node-logger'
import { NuclinoApi, NuclinoFile } from './nuclinoApi';
import cfg from './config'
import { FgBlue, FgMagenta,  Reset } from './consoleColors';
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
// ? Curried Function to Download Images while theire Url-Link from Nuclino is still fresh and accessible
const downloadImage = (fileHelper: FileHelper) => async (file: NuclinoFile) => {
    await fileHelper.downloadImageToDisk(file.download.url, file.fileName)
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


async function execDbgCmd() {

}
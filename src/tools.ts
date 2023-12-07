// @ts-ignore
import { prompt, Select } from 'enquirer'
import { fetchWorkspaces } from './nuclino';

enum KNOWN_CMDS {
    LIST_WORKSPACES = "List Workspaces",
    FIND_WORKSPACE = "Find WorkspaceId by Name"
}

const CMDS: Record<string, () => Promise<void>> = {
    [KNOWN_CMDS.LIST_WORKSPACES]: listWorkSpaces,
    [KNOWN_CMDS.FIND_WORKSPACE]: findWorkspaceByName
}

const cmdPrompt = new Select({
    name: "CMD",
    message: "What can i do for you?",
    choices: Object.keys(CMDS)
});

// ? Self executing async Main Function
(async () => {
    const cmdIndex = (await cmdPrompt.run()) as string
    if (CMDS[cmdIndex]) {
        await CMDS[cmdIndex]()
    } else {
        console.error('Whut? How dis happen?')
    }
})()

async function listWorkSpaces() {
    const workspaces = await fetchWorkspaces()
    const printable = workspaces.map((w) => { return{ name: w.name, id: w.id, teamId: w.teamId }} )
    console.table(printable)
}

async function findWorkspaceByName() {
    const res = await prompt({
        type: 'input',
        name: 'name',
        message: "What is the name of the Workspace",
    }) as {name: string}
    const workspaces = await fetchWorkspaces()
    console.log(workspaces.find((w) => w.name === res.name || w.name.includes(res.name)))
}
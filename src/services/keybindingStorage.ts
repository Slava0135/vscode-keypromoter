import * as fs from "fs";
import { readFileSync } from 'fs';
import { injectable } from "inversify";
import * as json from 'json5';
import * as path from 'path';
import { logger } from '../helper/logging';
import { Platform } from '../helper/platform';

class Keybinding {
    key!: string;
    command!: string;
}

@injectable()
export class KeybindingStorage {

    private readonly keybindings: Map<string, string[]>;
    public readonly userKeybindingsPath: string;

    constructor(private readonly platform: Platform, defaultOnly: boolean = false) {
        this.keybindings = new Map<string, string[]>();

        this.userKeybindingsPath = this.getUserKeybindingsPath();

        if (defaultOnly) {
            this.loadDefaultMap();
        } else {
            this.loadFullMap();
        }
    }

    public getKeybindingsFor(command: string): string[] {
        return this.keybindings.get(command) ?? [];
    }

    public allKeybindings(): Map<string, string[]> {
        return new Map(this.keybindings);
    }

    public patch(JsonPatch: string) {
        let patch = json.parse<Keybinding[]>(JsonPatch);
        for (let i in patch) {
            let key = patch[i].key;
            let command = patch[i].command;
            let keystrokes: Array<string>;
            if (command.startsWith("-")) {
                command = command.slice(1);
                keystrokes = this.keybindings.get(command) ?? new Array<string>();
                keystrokes = keystrokes.filter(other => other !== key);
            } else {
                keystrokes = this.keybindings.get(command) ?? new Array<string>();
                keystrokes.push(key);
            }
            this.keybindings.set(command, keystrokes);
        }
    }

    public updateKeybindings() {
        this.loadFullMap();
    }

    private getUserKeybindingsPath(): string {
        let pathToUser = "";
        switch (this.platform) {
            case Platform.LINUX:
                pathToUser = process.env.HOME + "/.config/Code";
                break;
            case Platform.WINDOWS:
                pathToUser = process.env.APPDATA + "/Code";
                break;
            case Platform.MACOS:
                pathToUser = process.env.HOME + "/Library/Application Support/Code";
                break;
        }

        pathToUser = ((process.env.VSCODE_PORTABLE ? process.env.VSCODE_PORTABLE + "/user-data/User/" : pathToUser) + "/User/keybindings.json")
            .replace(/\//g, this.platform === Platform.WINDOWS ? "\\" : "/");
        return pathToUser;
    }

    private loadFullMap() {
        this.keybindings.clear();
        this.loadDefaultMap();
        try {
            if (!fs.existsSync(this.userKeybindingsPath)) {
                logger.warn("user keybindings not found");
                return;
            }
            const userKeybindingsJson = readFileSync(this.userKeybindingsPath).toString();
            this.patch(userKeybindingsJson);
        } catch (e) {
            if (e instanceof Error) {
                logger.error(`error when loading user keybindings: ${e.message}`);
            }
        }

        if (this.platform === Platform.MACOS) {
            this.fixMacOsKeybindings();
        }
    }

    private loadDefaultMap() {
        try {
            let p = path.resolve(__dirname, '..', '..', 'default-keybindings', `${this.platform}.keybindings.json`);
            let file = readFileSync(p);
            let document = json.parse<Keybinding[]>(file.toString());
            for (let i in document) {
                let keystrokes = this.keybindings.get(document[i].command) ?? new Array<string>();
                keystrokes.push(document[i].key);
                this.keybindings.set(document[i].command, keystrokes);
            }
        } catch (e) {
            if (e instanceof Error) {
                logger.error(`error when loading default keybindings: ${e.message}`);
            }
        }
    }

    private fixMacOsKeybindings() {
        for (const [command, keybindings] of this.keybindings) {
            if (keybindings.some(it => it.includes("cmd"))) {
                const newKeybindings = keybindings.map(keybinding => keybinding.replaceAll("cmd", "meta"));
                this.keybindings.set(command, newKeybindings);
            }
        }
    }

}


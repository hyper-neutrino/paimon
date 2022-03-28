import { Client as DJSClient } from "discord.js";
import { Command, UserCommand, MessageCommand } from "./command.js";
import { is_string } from "./utils.js";

export class Client extends DJSClient {
    constructor(options) {
        super(options);
        this.options = options;
        this.commands = new Map();
        this.user_commands = new Map();
        this.message_commands = new Map();
        this.before = options.before;
        this.before_autocomplete = options.before_autocomplete;
        this.before_user_command = options.before_user_command;
        this.before_message_command = options.before_message_command;
        this.process = options.process;
        this.after = options.after;
        this.error = options.error;
        for (const command of options.commands || []) {
            this.add_command(command);
        }
        for (const event of options.events || []) {
            this.on(event.event, event.run);
        }
    }

    run(token) {
        this.on("interactionCreate", this.handle_command);
        this.login(token);
    }

    add_command(command) {
        if (command instanceof Command) {
            if (!this.commands.has(command.command)) {
                this.commands.set(command.command, {
                    subcommands: new Map(),
                    subgroups: new Map(),
                    options: [],
                });
            }
            const commanddir = this.commands.get(command.command);
            let dir;
            if (command.subgroup) {
                if (!commanddir.subgroups.has(command.subgroup)) {
                    commanddir.subgroups.set(command.subgroup, {
                        subcommands: new Map(),
                    });
                }
                const groupdir = commanddir.subgroups.get(command.subgroup);
                if (!groupdir.subcommands.has(command.subcommand)) {
                    groupdir.subcommands.set(command.subcommand, {
                        options: [],
                    });
                }
                dir = groupdir.subcommands.get(command.subcommand);
            } else if (command.subcommand) {
                if (!commanddir.subcommands.has(command.subcommand)) {
                    commanddir.subcommands.set(command.subcommand, {
                        options: [],
                    });
                }
                dir = commanddir.subcommands.get(command.subcommand);
            } else {
                dir = commanddir;
            }
            dir.description = command.description;
            dir.extras = command.extras;
            dir.execute = command.execute;
            dir.autocomplete = command.autocomplete;
            for (const option of command.options) {
                dir.options.push(option);
            }
        } else if (command instanceof UserCommand) {
            this.user_commands.set(command.name, {
                execute: command.execute,
                extras: command.extras,
            });
        } else if (command instanceof MessageCommand) {
            this.message_commands.set(command.name, {
                execute: command.execute,
                extras: command.extras,
            });
        }
    }

    async deploy(options) {
        options ||= {};
        const guild_id = options.guild_id;
        const commands = options.commands;

        for (const key of commands ?? this.commands.keys()) {
            const command = this.commands.get(key);
            if (!command) continue;
            const obj = {
                name: key,
                type: "CHAT_INPUT",
                description: command.description || "_",
                options: [],
            };
            for (const sgkey of command.subgroups.keys()) {
                const subgroup = command.subgroups.get(sgkey);
                const sgobj = {
                    name: sgkey,
                    type: "SUB_COMMAND_GROUP",
                    description: "_",
                    options: [],
                };
                load_subcommands(subgroup.subcommands, sgobj.options);
                obj.options.push(sgobj);
            }
            load_subcommands(command.subcommands, obj.options);
            load_options(command.options, obj.options);
            if (options.log) {
                console.log(`Creating chat command "${key}".`);
            }
            await this.application.commands.create(obj, guild_id);
        }

        for (const key of commands ?? this.user_commands.keys()) {
            if (!this.user_commands.get(key)) continue;
            console.log(`Creating user command "${key}".`);
            await this.application.commands.create(
                {
                    name: key,
                    type: "USER",
                },
                guild_id
            );
        }

        for (const key of commands ?? this.message_commands.keys()) {
            if (!this.message_commands.get(key)) continue;
            console.log(`Creating message command "${key}".`);
            await this.application.commands.create(
                {
                    name: key,
                    type: "MESSAGE",
                },
                guild_id
            );
        }
    }

    async handle_command(interaction) {
        if (interaction.isCommand() || interaction.isContextMenu()) {
            interaction.whisper = async (object) => {
                if (is_string(object)) object = { content: object };
                object.ephemeral = true;
                object.allowedMentions = { parse: [] };
                await interaction.reply(object);
            };

            interaction.shout = async (object) => {
                if (is_string(object)) object = { content: object };
                object.allowedMentions = { parse: [] };
                await interaction.reply(object);
            };
        }

        let object, args;

        if (interaction.isCommand() || interaction.isAutocomplete()) {
            object = this.commands.get(interaction.commandName);
            if (!object) return;
            const group = interaction.options.getSubcommandGroup(false);
            if (group) {
                object = object.subgroups.get(group);
                if (!object) return;
            }
            const sub = interaction.options.getSubcommand(false);
            if (sub) {
                object = object.subcommands.get(sub);
                if (!object) return;
            }
            if (interaction.isCommand()) {
                args = [];
                for (const option of object.options) {
                    args.push(
                        interaction.options[
                            getmap[
                                option.cast_to_member ? "MEMBER" : option.type
                            ]
                        ](option.name, option.required)
                    );
                }
                if (this.before) {
                    let initial = await this.before(
                        interaction,
                        object.extras,
                        ...args
                    );
                    if (initial) {
                        if (initial !== true)
                            await interaction.whisper(initial);
                        return;
                    }
                }
            } else {
                if (this.before_autocomplete) {
                    let initial = await this.before_autocomplete(
                        interaction,
                        object.extras,
                        interaction.options.getFocused()
                    );
                    if (initial) {
                        if (initial !== true) {
                            await interaction.respond(
                                initial.map((choice) => ({
                                    name: choice,
                                    value: choice,
                                }))
                            );
                        }
                        return;
                    }
                }
                if (!object.autocomplete) return;
                await interaction.respond(
                    (
                        await object.autocomplete(
                            interaction,
                            interaction.options.getFocused()
                        )
                    ).map((choice) => ({ name: choice, value: choice }))
                );
                return;
            }
        } else if (
            interaction.isUserContextMenu() ||
            interaction.isMessageContextMenu()
        ) {
            object = (
                interaction.isUserContextMenu()
                    ? this.user_commands
                    : this.message_commands
            ).get(interaction.commandName);
            args = [
                interaction.isUserContextMenu()
                    ? interaction.user
                    : interaction.message,
            ];
        } else {
            return;
        }

        if (!object) return;
        if (!object.execute) return;

        let success = true;
        try {
            let response = await object.execute(interaction, ...args);
            if (this.process) {
                response = await this.process(interaction, response, ...args);
            }
            if (response) await interaction.whisper(response);
        } catch (error) {
            success = false;
            if (this.error) {
                await this.error(interaction, error, object.extras, ...args);
            } else {
                console.error(error.stack ?? error);
            }
        }
        if (this.after) {
            await this.after(interaction, success, object.extras, ...args);
        }
    }
}

function load_subcommands(subcommands, options) {
    for (const subkey of subcommands.keys()) {
        const subcommand = subcommands.get(subkey);
        const subobj = {
            name: subkey,
            type: "SUB_COMMAND",
            description: subcommand.description,
            options: [],
        };
        load_options(subcommand.options, subobj.options);
        options.push(subobj);
    }
}

function load_options(list, options) {
    for (const option of list) {
        options.push(option);
    }
}

const getmap = {
    STRING: "getString",
    INTEGER: "getInteger",
    BOOLEAN: "getBoolean",
    USER: "getUser",
    MEMBER: "getMember",
    CHANNEL: "getChannel",
    ROLE: "getRole",
    MENTIONABLE: "getMentionable",
    NUMBER: "getNumber",
};

class Next extends Error {}

import { CommandSyntaxError } from "./errors.js";

export class Command {
    constructor({
        name,
        description,
        options,
        execute,
        autocomplete,
        ...extras
    }) {
        const components = name.trim().split(/\s+/);

        if (components.length <= 0) {
            throw new CommandSyntaxError("Command cannot be empty.");
        }

        if (components.length > 3) {
            throw new CommandSyntaxError(
                "Command can only contain three components at most."
            );
        }

        if (components.length == 1) {
            [this.command] = components;
        } else if (components.length == 2) {
            [this.command, this.subcommand] = components;
        } else {
            [this.command, this.subgroup, this.subcommand] = components;
        }

        this.description = description;
        this.extras = extras;

        if (
            !options.every((option) =>
                [option]
                    .flat()[0]
                    .match(
                        /(s|str|string|i|int|integer|b|bool|boolean|u|user|m|member|c|channel|r|role|p|pingable|mentionable|n|num|number):[\w\-]+!?\*?(:\S+)?\s+.+/
                    )
            )
        ) {
            throw new CommandSyntaxError(
                "Options must match the format `type:name[!][*][:options] description`."
            );
        }

        this.options = [];

        for (const input of options) {
            const [syntax, ...choices] = [input].flat();
            const [prefix, ..._description] = syntax.split(" ");
            const description = _description.join(" ");
            let [type, name, extra] = prefix.split(":");
            let autocomplete = false,
                required = true;

            if (name.endsWith("*")) {
                required = false;
                name = name.substring(0, name.length - 1);
            }

            if (name.endsWith("!")) {
                autocomplete = true;
                name = name.substring(0, name.length - 1);
            }

            const option = {
                name,
                description,
            };

            if (choices.length > 0) {
                option.choices = choices.map((item) =>
                    Array.isArray(item)
                        ? { name: item[0], value: item[1] }
                        : { name: item, value: item }
                );
            }
            if (autocomplete) option.autocomplete = true;
            if (required) option.required = true;

            switch (type) {
                case "s":
                case "str":
                case "string":
                    option.type = "STRING";
                    break;
                case "i":
                case "int":
                case "integer":
                    option.type = "INTEGER";
                    if (extra) {
                        if (!extra.match("-")) {
                            throw new CommandSyntaxError(
                                "Could not parse integer argument: extra options are expected to be of the form [min]-[max]"
                            );
                        }
                        const [left, right] = extra.split("-");
                        if (left) option.minValue = parseInt(left);
                        if (right) option.maxValue = parseInt(right);
                    }
                    break;
                case "b":
                case "bool":
                case "boolean":
                    option.type = "BOOLEAN";
                    break;
                case "m":
                case "member":
                    option.cast_to_member = true;
                case "u":
                case "user":
                    option.type = "USER";
                    break;
                case "c":
                case "channel":
                    option.type = "CHANNEL";
                    const types = [];
                    if (extra) {
                        for (const code of extra.split(",")) {
                            if (typemap.has(code)) {
                                types.push(typemap.get(code));
                            } else {
                                throw new CommandSyntaxError(
                                    `Could not parse channel argument; the type code ${code} was not understood.`
                                );
                            }
                        }
                        option.channelTypes = types;
                    }
                    break;
                case "r":
                case "role":
                    option.type = "ROLE";
                    break;
                case "p":
                case "pingable":
                case "mentionable":
                    option.type = "MENTIONABLE";
                    break;
                case "n":
                case "num":
                case "number":
                    option.type = "NUMBER";
                    if (extra) {
                        if (!extra.match("-")) {
                            throw new CommandSyntaxError(
                                "Could not parse number argument: extra options are expected to be of the form [min]-[max]"
                            );
                        }
                        const [left, right] = extra.split("-");
                        if (left) option.minValue = parseFloat(left);
                        if (right) option.maxValue = parseFloat(right);
                    }
                    break;
                default:
                    throw new CommandSyntaxError(
                        `Unrecognized type flag: ${type}.`
                    );
            }

            this.options.push(option);
        }

        this.execute = execute;
        this.autocomplete = autocomplete;
    }
}

export class UserCommand {
    constructor({ name, execute, ...extras }) {
        this.name = name;
        this.execute = execute;
        this.extras = extras;
    }
}

export class MessageCommand {
    constructor({ name, execute, ...extras }) {
        this.name = name;
        this.execute = execute;
        this.extras = extras;
    }
}

const typemap = new Map([
    ["text", "GUILD_TEXT"],
    ["dm", "DM"],
    ["voice", "GUILD_VOICE"],
    ["group", "GROUP_DM"],
    ["category", "GUILD_CATEGORY"],
    ["news", "GUILD_NEWS"],
    ["store", "GUILD_SCORE"],
    ["newsthread", "GUILD_NEWS_THREAD"],
    ["publicthread", "GUILD_PUBLIC_THREAD"],
    ["privatethread", "GUILD_PRIVATE_THREAD"],
    ["stage", "GUILD_STAGE_VOICE"],
    ["unknown", "UNKNOWN"],
]);

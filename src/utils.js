import { recursive, require } from "file-ez";

export async function load_all(dir) {
    return (
        await Promise.all((await recursive(dir)).map((item) => require(item)))
    ).flat();
}

export function is_string(object) {
    return typeof object == "string" || object instanceof String;
}

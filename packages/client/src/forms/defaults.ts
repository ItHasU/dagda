import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import { BooleanFieldEditor } from "./editors/boolean.editor";
import { EnumFieldEditorComponent } from "./editors/enum.editor";
import { NumberFieldEditor } from "./editors/number.editor";
import { TextFieldEditor } from "./editors/text.editor";
import { defaultFieldEditors } from "./editors";

/**
 * Registers the default editor for each base type (FEATURES §8.1).
 *
 * Split out of `editors.ts` so that importing the registry does not, by
 * itself, pull every default editor's component (and its custom element
 * registration) into a bundle that only wants to declare overrides.
 *
 * Called by the framework's own client entry point (`app/index.ts`), not by
 * the application: Utilisateurs and Rôles are framework pages and they build
 * editors, so an empty registry is a crash on a screen the application never
 * asked for. An application calls this again only if it wants its overrides
 * grouped with the defaults, the way MQTTToolbox 2 does.
 */
export function registerDefaultFieldEditors(): void {
    defaultFieldEditors.registerDefault(JSTypes.string, () => new TextFieldEditor());
    defaultFieldEditors.registerDefault(JSTypes.number, () => new NumberFieldEditor());
    defaultFieldEditors.registerDefault(JSTypes.boolean, () => new BooleanFieldEditor());
    defaultFieldEditors.registerEnumDefault(() => new EnumFieldEditorComponent());
}

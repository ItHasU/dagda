import { FieldTypeDefinition } from "@dagda/shared/src/entities/model";
import { EnumDefinition } from "@dagda/shared/src/entities/tools/enums";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";

/**
 * Contract every field editor must satisfy, whatever field type it edits
 * (FEATURES §8.1).
 *
 * A generated form only ever talks to an editor through this: get/set the
 * value, ask whether it is acceptable. It is deliberately not a base class —
 * an editor is a plain custom element, so nothing stops it from being built
 * out of `AbstractWebComponent` like every other component.
 */
export interface FieldEditor<T = unknown> extends HTMLElement {
    value: T | null;
    /** @returns why the current value cannot be accepted, or null if it can */
    getValueError(): string | null;
}

/**
 * A field editor for an enumeration additionally needs to know which one:
 * unlike a scalar type, the set of valid values is not fixed by the editor's
 * class, it comes from the field being edited.
 */
export interface EnumFieldEditor extends FieldEditor<any> {
    setEnumeration(enumeration: EnumDefinition<any>): void;
}

function isEnumFieldEditor(editor: FieldEditor): editor is EnumFieldEditor {
    return typeof (editor as Partial<EnumFieldEditor>).setEnumeration === "function";
}

export type FieldEditorFactory<Editor extends FieldEditor = FieldEditor> = () => Editor;

/**
 * Maps a field's type to the editor that renders it (FEATURES §8.1).
 *
 * Two-level lookup, the same idiom `EntitiesModel`/`SettingsModel` already use
 * to resolve a type: a named type (e.g. `"MARKDOWN"`) is looked up first, so
 * an application can give two fields sharing the same raw type — say, two
 * strings — different editors; anything not overridden falls back to the
 * default editor for its raw type, so every field renders out of the box.
 *
 * Enumerations are not a raw type of their own: whatever the lookup resolves
 * to, if the field's type is an `EnumDefinition`, the editor it returns is
 * configured with it via `setEnumeration()` before being handed back.
 */
export class FieldEditorRegistry {

    protected readonly _byTypeName = new Map<string, FieldEditorFactory>();
    protected readonly _byRawType = new Map<JSTypes, FieldEditorFactory>();
    protected _enumFactory: FieldEditorFactory<EnumFieldEditor> | null = null;

    /** Registers the editor for a named type of the model (e.g. `"MARKDOWN"`), overriding its default */
    public registerForType(typeName: string, factory: FieldEditorFactory): void {
        this._byTypeName.set(typeName, factory);
    }

    /** Registers the editor used for every field of a given raw type, unless a named override exists */
    public registerDefault(rawType: JSTypes, factory: FieldEditorFactory): void {
        this._byRawType.set(rawType, factory);
    }

    /** Registers the editor used for every enumeration, unless a named override exists */
    public registerEnumDefault(factory: FieldEditorFactory<EnumFieldEditor>): void {
        this._enumFactory = factory;
    }

    /**
     * Builds the editor for a field.
     * @param typeDefinition what the field's type resolves to: a raw type, or an enumeration
     * @param typeName the field's named type (e.g. `"MARKDOWN"`), when it has one, so a named override can apply
     * @throws if nothing is registered for this type, or if a named override does not support an enumeration it is handed
     */
    public createEditor(typeDefinition: FieldTypeDefinition<any, any> | EnumDefinition<any>, typeName?: string): FieldEditor {
        const override = typeName != null ? this._byTypeName.get(typeName) : undefined;
        const editor = override != null ? override() : this._createDefaultEditor(typeDefinition, typeName);

        if (typeDefinition instanceof EnumDefinition) {
            if (!isEnumFieldEditor(editor)) {
                throw new Error(`Editor "${editor.tagName.toLowerCase()}" registered for type "${typeName}" does not support enumerations`);
            }
            editor.setEnumeration(typeDefinition);
        }

        return editor;
    }

    protected _createDefaultEditor(typeDefinition: FieldTypeDefinition<any, any> | EnumDefinition<any>, typeName: string | undefined): FieldEditor {
        if (typeDefinition instanceof EnumDefinition) {
            if (this._enumFactory == null) {
                throw new Error("No default editor registered for enumerations");
            }
            return this._enumFactory();
        }

        const factory = this._byRawType.get(typeDefinition.rawType);
        if (factory == null) {
            const type = typeName != null ? `"${typeName}"` : `raw type "${typeDefinition.rawType}"`;
            throw new Error(`No editor registered for type ${type}`);
        }
        return factory();
    }
}

/**
 * The registry every application starts from, pre-populated with an editor
 * for each base type (FEATURES §8.1). Extend it with `registerForType()`
 * rather than replacing it, so custom types are the only thing an application
 * declares.
 */
export const defaultFieldEditors = new FieldEditorRegistry();

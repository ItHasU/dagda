import { FieldTypeDefinition } from "../entities/model";
import { EnumDefinition } from "../entities/tools/enums";

/**
 * Declaration of one field of a generated form (FEATURES §8.1): enough to
 * pick an editor and validate what it holds, independent of where the field
 * comes from — a system setting, an entity, or a script parameter. The three
 * intended sources (§11.5, a business form, §11.3) each project their own
 * declaration shape into this one rather than sharing it directly, since none
 * of them is a subset of the others (`SettingDeclaration` alone carries
 * `secret`/`env`, for instance).
 */
export interface FormFieldDeclaration<T = unknown> {
    /** Key the value is read and written under */
    key: string;
    /** Displayed above the field */
    label: string;
    /** Displayed under the field */
    description?: string;
    /** What the field holds: a raw type, or an enumeration */
    type: FieldTypeDefinition<any, any> | EnumDefinition<any>;
    /** The field's named type (e.g. `"MARKDOWN"`), so a registered editor override applies */
    typeName?: string;
    /** Value the field starts from */
    default?: T;
    /** Whether an empty value is refused. Defaults to false */
    required?: boolean;
}

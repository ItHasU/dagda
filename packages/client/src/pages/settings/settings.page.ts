import { actionCall } from "@dagda/client/src/actions";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
// Side-effect import: registers the "dagda-form" custom element, otherwise
// only a type-only reference would survive tree-shaking and the template's
// <dagda-form> tag would render as nothing.
import "@dagda/client/src/forms/form.component";
import { DagdaForm, FormSubmitDetail } from "@dagda/client/src/forms/form.component";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { SettingsModel } from "@dagda/shared/src/settings/model";
import { FormFieldDeclaration } from "@dagda/shared/src/forms/types";
import template from "./settings.page.html";

/** What `Dagda.get<SettingsService>("settingsModel")` exposes */
export interface SettingsService {
    settingsModel: SettingsModel<any>;
}

/**
 * System settings editing screen (Dagda FEATURES §11.5, ROADMAP tranche 3),
 * reserved to administrators (`settings.manage`) — `<dagda-form>`'s first
 * real consumer: a flat list of labelled fields with a submit button is
 * exactly its shape.
 *
 * Field declarations come straight from the application's own `SettingsModel`
 * (`Dagda.get<SettingsModel<any>>("settingsModel")`, supplied via
 * `DagdaClient.start({settings})`), read at use-time rather than module
 * scope — `Dagda.init()` hasn't run yet when this module is first imported.
 * Labels, descriptions, types and defaults live there, the very instance the
 * server itself reads. Only the current values and the write actually need a
 * round trip.
 *
 * `getSettingsValues()` deliberately answers "what may an administrator see
 * and change", not "what may ordinary client code read" — it ignores each
 * setting's declared `visibility` and only excludes secrets, which the
 * screen never receives in the first place (Dagda FEATURES §11.5: written,
 * never read back in clear).
 */
export class SettingsPage extends AbstractPageElement {

    protected get _settings(): SettingsModel<any> {
        return Dagda.get<SettingsService>("settingsModel");
    }

    @Ref()
    protected _form!: DagdaForm;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._form.addEventListener("dagda-form-submit", (event) => {
            const values = (event as CustomEvent<FormSubmitDetail>).detail.values;
            this._save(values).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });
    }

    protected override async _refresh(): Promise<void> {
        let values: Record<string, unknown>;
        try {
            values = await actionCall<DagdaActions, "getSettingsValues">("getSettingsValues");
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
            return;
        }
        this._form.setFields(this._buildFields(values));
        this._maskSecretField();
    }

    /**
     * One field per declared setting. A secret key gets no `default` at
     * all — never the fetched value, since `getSettingsValues()` never sends
     * one — so its editor genuinely starts empty.
     */
    protected _buildFields(values: Record<string, unknown>): FormFieldDeclaration[] {
        const settings = this._settings;
        return settings.getKeys().map((key) => {
            const declaration = settings.getDeclaration(key);
            const enumeration = settings.getEnum(key);
            const secret = settings.isSecret(key);
            return {
                key: String(key),
                label: declaration.label,
                description: declaration.description,
                type: enumeration ?? EntitiesModel.type({ rawType: settings.getRawType(key) }),
                default: secret ? undefined : values[String(key)]
            };
        });
    }

    /**
     * Password-style masking on the secret field: a nice-to-have, not a
     * framework mechanism (the editor registry resolves by type, not by a
     * per-field "is this one secret" flag) — reach into the rendered
     * editor's input directly. Purely cosmetic: the value never reaches the
     * client either way, this only avoids shoulder-surfing while typing one.
     */
    protected _maskSecretField(): void {
        const settings = this._settings;
        const keys = settings.getKeys();
        const secretIndex = keys.findIndex((key) => settings.isSecret(key));
        if (secretIndex < 0) {
            return;
        }
        const field = this._form.querySelectorAll<HTMLElement>(".field")[secretIndex];
        const input = field?.querySelector("input");
        if (input != null) {
            input.type = "password";
        }
    }

    /**
     * The submit event carries every declared field's value, always — a
     * secret editor left untouched is simply empty. Writing that back would
     * overwrite the stored secret with "", so a blank secret is skipped
     * entirely: no `setSetting` call for it, which is what "leave it
     * untouched" has to mean here.
     */
    protected async _save(values: Record<string, unknown>): Promise<void> {
        const settings = this._settings;
        for (const [key, value] of Object.entries(values)) {
            if (settings.isDeclared(key) && settings.isSecret(key) && value === "") {
                continue;
            }
            await actionCall<DagdaActions, "setSetting">("setSetting", { key, value });
        }
        showToast("Paramètres enregistrés.", "success");
    }

}
customElements.define("settings-page", SettingsPage);

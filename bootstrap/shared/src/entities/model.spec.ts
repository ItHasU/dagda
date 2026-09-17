import { describe, expect, it } from "vitest";
import { APP_MODEL } from "./model";

describe("APP_MODEL", () => {

    it("declares notes.projectId as a foreign key to projects, named after the referenced table (CLAUDE.md convention)", () => {
        expect(APP_MODEL.isFieldForeign("notes", "projectId")).toBe(true);
        expect(APP_MODEL.getFieldForeignTableName("notes", "projectId")).toBe("projects");
    });

});

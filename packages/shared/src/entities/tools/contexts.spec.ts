import { describe, expect, it } from "vitest";
import { BaseContext } from "../types";
import { alsoIntersectsOtherTypes, alwaysIntersects, buildContextAdapter, intersectsOnEqualOptions, intersectsWhen, neverIntersects, optionsEqual } from "./contexts";

//#region Contexts of a fictional application ---------------------------------

/** No option at all */
type UsersContext = BaseContext<"users", undefined>;
/** One optional option, undefined meaning "every user" */
type ProjectsContext = BaseContext<"projects", { userId?: number }>;
/** One mandatory option : the case EurekAI needs */
type ProjectContext = BaseContext<"project", { projectId: number }>;
/** Two mandatory options */
type PicturesContext = BaseContext<"pictures", { projectId: number, promptId: number }>;
/** Read only data, never invalidated by a transaction */
type SystemContext = BaseContext<"system", undefined>;

type AppContexts = UsersContext | ProjectsContext | ProjectContext | PicturesContext | SystemContext;

const ADAPTER = buildContextAdapter<AppContexts>({
    users: alwaysIntersects(),
    projects: intersectsWhen((newContext, oldContext) =>
        newContext.options.userId == null || oldContext.options.userId == null || newContext.options.userId === oldContext.options.userId),
    project: intersectsOnEqualOptions(),
    pictures: intersectsOnEqualOptions(),
    system: neverIntersects()
});

//#endregion

describe("optionsEqual", () => {

    it("handles the contexts with no option", () => {
        expect(optionsEqual(undefined, undefined)).toBe(true);
        expect(optionsEqual(null, undefined)).toBe(true);
        expect(optionsEqual(undefined, {})).toBe(true);
        expect(optionsEqual(undefined, { userId: undefined })).toBe(true);
        expect(optionsEqual(undefined, { userId: 1 })).toBe(false);
    });

    it("compares every parameter", () => {
        expect(optionsEqual({ projectId: 1 }, { projectId: 1 })).toBe(true);
        expect(optionsEqual({ projectId: 1 }, { projectId: 2 })).toBe(false);
        expect(optionsEqual({ projectId: 1, promptId: 2 }, { projectId: 1, promptId: 2 })).toBe(true);
        expect(optionsEqual({ projectId: 1, promptId: 2 }, { projectId: 1, promptId: 3 })).toBe(false);
    });

    it("treats a missing parameter and an undefined parameter as equal", () => {
        expect(optionsEqual({ userId: undefined }, {})).toBe(true);
        expect(optionsEqual({ userId: 1 }, {})).toBe(false);
    });

    it("does not compare nested objects by value", () => {
        // Documented limitation : one strict equality per parameter
        const shared = { a: 1 };
        expect(optionsEqual({ nested: shared }, { nested: shared })).toBe(true);
        expect(optionsEqual({ nested: { a: 1 } }, { nested: { a: 1 } })).toBe(false);
    });

});

describe("Ready-made context rules", () => {

    it("alwaysIntersects : equal only on equal options, but always intersecting", () => {
        const rule = alwaysIntersects<ProjectContext>();
        const a: ProjectContext = { type: "project", options: { projectId: 1 } };
        const b: ProjectContext = { type: "project", options: { projectId: 2 } };
        expect(rule.equals(a, a)).toBe(true);
        expect(rule.equals(a, b)).toBe(false);
        expect(rule.intersects(a, b)).toBe(true);
    });

    it("neverIntersects : equal on equal options, but never intersecting", () => {
        const rule = neverIntersects<ProjectContext>();
        const a: ProjectContext = { type: "project", options: { projectId: 1 } };
        expect(rule.equals(a, { type: "project", options: { projectId: 1 } })).toBe(true);
        expect(rule.intersects(a, a)).toBe(false);
    });

    it("intersectsOnEqualOptions : both notions follow the options", () => {
        const rule = intersectsOnEqualOptions<PicturesContext>();
        const a: PicturesContext = { type: "pictures", options: { projectId: 1, promptId: 1 } };
        const b: PicturesContext = { type: "pictures", options: { projectId: 1, promptId: 2 } };
        expect(rule.equals(a, { type: "pictures", options: { projectId: 1, promptId: 1 } })).toBe(true);
        expect(rule.intersects(a, { type: "pictures", options: { projectId: 1, promptId: 1 } })).toBe(true);
        expect(rule.equals(a, b)).toBe(false);
        expect(rule.intersects(a, b)).toBe(false);
    });

    it("intersectsWhen : equality stays on the options, intersection is delegated", () => {
        const rule = intersectsWhen<ProjectsContext>(() => true);
        const a: ProjectsContext = { type: "projects", options: { userId: 1 } };
        const b: ProjectsContext = { type: "projects", options: { userId: 2 } };
        expect(rule.equals(a, b)).toBe(false);
        expect(rule.intersects(a, b)).toBe(true);
    });

});

describe("buildContextAdapter", () => {

    it("never matches two contexts of different types", () => {
        const project: ProjectContext = { type: "project", options: { projectId: 1 } };
        const projects: ProjectsContext = { type: "projects", options: { userId: 1 } };
        expect(ADAPTER.contextEquals(project, projects as any)).toBe(false);
        expect(ADAPTER.contextIntersects(project, projects as any)).toBe(false);
    });

    it("handles a context with no option", () => {
        const users: UsersContext = { type: "users", options: undefined };
        expect(ADAPTER.contextEquals(users, { type: "users", options: undefined })).toBe(true);
        expect(ADAPTER.contextIntersects(users, { type: "users", options: undefined })).toBe(true);
    });

    it("handles a context with a mandatory option", () => {
        const project1: ProjectContext = { type: "project", options: { projectId: 1 } };
        const project1bis: ProjectContext = { type: "project", options: { projectId: 1 } };
        const project2: ProjectContext = { type: "project", options: { projectId: 2 } };

        expect(ADAPTER.contextEquals(project1, project1bis)).toBe(true);
        expect(ADAPTER.contextEquals(project1, project2)).toBe(false);
        expect(ADAPTER.contextIntersects(project1, project1bis)).toBe(true);
        expect(ADAPTER.contextIntersects(project1, project2)).toBe(false);
    });

    it("handles a context with several options", () => {
        const a: PicturesContext = { type: "pictures", options: { projectId: 1, promptId: 1 } };
        const b: PicturesContext = { type: "pictures", options: { projectId: 1, promptId: 2 } };
        expect(ADAPTER.contextEquals(a, b)).toBe(false);
        expect(ADAPTER.contextIntersects(a, b)).toBe(false);
    });

    it("handles an option meaning \"every value\"", () => {
        const all: ProjectsContext = { type: "projects", options: {} };
        const forUser1: ProjectsContext = { type: "projects", options: { userId: 1 } };
        const forUser2: ProjectsContext = { type: "projects", options: { userId: 2 } };

        // Equality stays strict : the two fetches do not return the same data
        expect(ADAPTER.contextEquals(all, forUser1)).toBe(false);
        // Intersection is not : a change on user 1 makes the "every user" cache dirty
        expect(ADAPTER.contextIntersects(forUser1, all)).toBe(true);
        expect(ADAPTER.contextIntersects(all, forUser1)).toBe(true);
        expect(ADAPTER.contextIntersects(forUser1, forUser2)).toBe(false);
    });

    it("keeps equality and intersection distinct", () => {
        const users: UsersContext = { type: "users", options: undefined };
        const system: SystemContext = { type: "system", options: undefined };
        // "users" : always intersecting even though only equal contexts are the same fetch
        expect(ADAPTER.contextIntersects(users, users)).toBe(true);
        // "system" : equal to itself, yet a transaction never invalidates it
        expect(ADAPTER.contextEquals(system, system)).toBe(true);
        expect(ADAPTER.contextIntersects(system, system)).toBe(false);
    });

    it("stays symmetric on the ready-made rules", () => {
        const contexts: AppContexts[] = [
            { type: "users", options: undefined },
            { type: "system", options: undefined },
            { type: "projects", options: {} },
            { type: "projects", options: { userId: 1 } },
            { type: "projects", options: { userId: 2 } },
            { type: "project", options: { projectId: 1 } },
            { type: "pictures", options: { projectId: 1, promptId: 1 } }
        ];
        for (const a of contexts) {
            for (const b of contexts) {
                expect(
                    ADAPTER.contextIntersects(a, b),
                    `intersection must not depend on the order of ${a.type} and ${b.type}`
                ).toBe(ADAPTER.contextIntersects(b, a));
            }
        }
    });

    it("fails loudly on a context type with no rule", () => {
        const partial = buildContextAdapter<AppContexts>({
            users: alwaysIntersects(),
            projects: intersectsOnEqualOptions(),
            project: intersectsOnEqualOptions(),
            pictures: intersectsOnEqualOptions(),
            system: undefined as any
        });
        const system: SystemContext = { type: "system", options: undefined };
        expect(() => partial.contextEquals(system, system)).toThrowError(/No rule declared for the context type "system"/);
    });

});

//#region Cross type intersection ---------------------------------------------

/**
 * The real case of MQTTToolbox 2, replayed against the ready-made rules.
 *
 * The topic list carries lastMessageAt for every topic, so a message arriving on
 * one topic leaves both that topic's history and the list stale. The relation
 * crosses the context types, and the write comes from the server (MQTT ingestion),
 * not from a client that would hold the "topics" context among its active ones.
 */
type TopicsContext = BaseContext<"topics", undefined>;
type TopicContext = BaseContext<"topic", { topicId: number }>;
type MqttContexts = TopicsContext | TopicContext;

const MQTT_ADAPTER = buildContextAdapter<MqttContexts>({
    // Anything happening on any topic touches the list, whatever its type
    topics: alsoIntersectsOtherTypes(alwaysIntersects()),
    // Two histories only intersect when they are the same topic
    topic: intersectsOnEqualOptions()
});

const TOPICS: MqttContexts = { type: "topics", options: undefined };
const topic = (topicId: number): MqttContexts => ({ type: "topic", options: { topicId } });

describe("Cross type intersection", () => {

    it("keeps two contexts of different types unequal", () => {
        expect(MQTT_ADAPTER.contextEquals(TOPICS, topic(1))).toBe(false);
        expect(MQTT_ADAPTER.contextEquals(topic(1), TOPICS)).toBe(false);
    });

    it("keeps equality untouched inside a type", () => {
        expect(MQTT_ADAPTER.contextEquals(TOPICS, TOPICS)).toBe(true);
        expect(MQTT_ADAPTER.contextEquals(topic(1), topic(1))).toBe(true);
        expect(MQTT_ADAPTER.contextEquals(topic(1), topic(2))).toBe(false);
    });

    it("invalidates the list whichever topic changed", () => {
        expect(MQTT_ADAPTER.contextIntersects(topic(42), TOPICS)).toBe(true);
        expect(MQTT_ADAPTER.contextIntersects(TOPICS, topic(42))).toBe(true);
    });

    it("keeps the intersection distinct from the equality", () => {
        expect(MQTT_ADAPTER.contextEquals(TOPICS, topic(1))).toBe(false);
        expect(MQTT_ADAPTER.contextIntersects(TOPICS, topic(1))).toBe(true);
    });

    it("keeps two topic histories independent", () => {
        expect(MQTT_ADAPTER.contextIntersects(topic(1), topic(2))).toBe(false);
        expect(MQTT_ADAPTER.contextIntersects(topic(1), topic(1))).toBe(true);
        expect(MQTT_ADAPTER.contextIntersects(TOPICS, TOPICS)).toBe(true);
    });

    it("is symmetric although the relation is declared on one side only", () => {
        const cases: [MqttContexts, MqttContexts][] = [
            [TOPICS, TOPICS],
            [TOPICS, topic(1)],
            [topic(1), topic(1)],
            [topic(1), topic(2)]
        ];
        for (const [a, b] of cases) {
            expect(
                MQTT_ADAPTER.contextIntersects(a, b),
                `intersection must not depend on the order of ${a.type} and ${b.type}`
            ).toBe(MQTT_ADAPTER.contextIntersects(b, a));
        }
    });

    it("can target the other types instead of taking them all", () => {
        type PicturesContext = BaseContext<"pictures", { projectId: number }>;
        type ProjectContext = BaseContext<"project", { projectId: number }>;
        type UsersContext = BaseContext<"users", undefined>;
        type Contexts = PicturesContext | ProjectContext | UsersContext;

        const adapter = buildContextAdapter<Contexts>({
            // The pictures of a project only concern that very project,
            // and have nothing to do with the users
            pictures: alsoIntersectsOtherTypes<PicturesContext, ProjectContext | UsersContext>(
                intersectsOnEqualOptions(),
                (own, other) => other.type === "project" && other.options.projectId === own.options.projectId),
            project: intersectsOnEqualOptions(),
            users: alwaysIntersects()
        });

        const pictures1: Contexts = { type: "pictures", options: { projectId: 1 } };
        const project1: Contexts = { type: "project", options: { projectId: 1 } };
        const project2: Contexts = { type: "project", options: { projectId: 2 } };
        const users: Contexts = { type: "users", options: undefined };

        expect(adapter.contextIntersects(pictures1, project1)).toBe(true);
        expect(adapter.contextIntersects(project1, pictures1)).toBe(true);
        expect(adapter.contextIntersects(pictures1, project2)).toBe(false);
        expect(adapter.contextIntersects(project2, pictures1)).toBe(false);
        expect(adapter.contextIntersects(pictures1, users)).toBe(false);
        expect(adapter.contextIntersects(users, pictures1)).toBe(false);
    });

    it("does not make contexts of other types intersect when no rule says so", () => {
        // The default stays the safe one: an application that needs nothing writes nothing
        const adapter = buildContextAdapter<MqttContexts>({
            topics: alwaysIntersects(),
            topic: intersectsOnEqualOptions()
        });
        expect(adapter.contextIntersects(TOPICS, topic(1))).toBe(false);
        expect(adapter.contextIntersects(topic(1), TOPICS)).toBe(false);
    });

});

//#endregion

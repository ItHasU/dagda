/**
 * MQTT Dashboard — squelette de contrats (phase de définition).
 *
 * Ce fichier est un ARTEFACT DE CONCEPTION, pas du code de production :
 * il fige les types/signatures des fonctionnalités décrites dans `features.md`.
 * Il n'est volontairement pas branché au build (pas d'imports @dagda/*),
 * les équivalents Dagda sont indiqués en commentaire.
 *
 * Quand on passera à l'implémentation, ces types seront répartis dans
 * shared / server / client de l'application.
 */

/* =========================================================================
 * 1. Types de domaine (repris de MQTTToolbox, à conserver)
 * ========================================================================= */

export interface MQTTMessage {
    topic: string;
    /** Payload brut. `Buffer` côté serveur ; encodage à décider pour le transport. */
    payload: Uint8Array;
    timestamp: number;
}

export interface ScheduledMessage extends MQTTMessage {
    id: number;
}

export interface MQTTServerOptions {
    url: string;
    /** Options client MQTT (clientId, username, password...). */
    options?: {
        clientId?: string;
        username?: string;
        password?: string;
    };
    /** Topics souscrits au broker. */
    topics: string[];
}

export interface MQTTPublishOptions {
    /** Délai (ms) avant publication. */
    timeout?: number;
    /** Timestamp cible de publication (prioritaire sur `timeout`). */
    timestamp?: number;
}

/** Une tâche récurrente hebdomadaire d'un scénario cron. */
export interface CronTask {
    /** [lun, mar, mer, jeu, ven, sam, dim] */
    days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
    hours: number;
    minutes: number;
    topic: string;
    payload: string;
}

export interface CronScenario {
    activated: boolean;
    name: string;
    tasks: CronTask[];
}

/** État de la connexion au broker (poussé au client). */
export interface MQTTConnectionStatus {
    connected: boolean;
    url?: string;
}

/* =========================================================================
 * 2. Schéma de configuration applicative
 *    -> tiré par la NOUVELLE brique framework `ConfigService<Schema>`.
 *    (remplace `ConfigFile` de MQTTToolbox)
 * ========================================================================= */

export interface AppConfig {
    /** Réglages de connexion au broker. */
    mqtt: MQTTServerOptions;
    /** HTML libre du dashboard (édité par l'utilisateur). */
    dashboard: string;
    /** Scénarios cron. */
    cron: CronScenario[];
}

/* =========================================================================
 * 3. Brique framework à créer : ConfigService<Schema>
 *    Généralisation du `Config` de MQTTToolbox.
 *    Backend de stockage volontairement absent de l'interface (pluggable).
 * ========================================================================= */

export interface ConfigService<Schema> {
    config: {
        /** Lit une clé, avec valeur par défaut optionnelle. */
        get<K extends keyof Schema>(key: K, defaultValue?: Schema[K]): Promise<Schema[K]>;
        /** Écrit un sous-ensemble de clés : persiste puis déclenche les callbacks. */
        set(values: Partial<Schema>): Promise<void>;
        /** Réagit au changement d'une clé (utilisé par le cron et le proxy MQTT). */
        on<K extends keyof Schema>(key: K, callback: (key: K, value: Schema[K]) => void): void;
    };
}

/* =========================================================================
 * 4. Events (push serveur -> client)
 *    -> map d'events Dagda (équiv. `DagdaEvents & Record<string, unknown>`).
 *    Topics dynamiques => un seul event `mqttMessage`, filtrage par topic côté client.
 * ========================================================================= */

export interface AppEvents {
    /** Un message MQTT vient d'être reçu (ou (re)publié). */
    mqttMessage: MQTTMessage;
    /** L'état de la connexion au broker a changé. */
    mqttConnection: MQTTConnectionStatus;
    /** La file des messages programmés a changé. */
    scheduledChanged: { messages: ScheduledMessage[] };
    /** Une clé de configuration a changé (propagation au client). */
    configChanged: { key: keyof AppConfig };
    // + events d'auth fournis par Dagda (auth/events)
}

/* =========================================================================
 * 5. API RPC typée (équiv. `APICollection` de Dagda)
 *    Remplace les routers express + proxies manuels (/mqtt, /config).
 * ========================================================================= */

export interface MqttAPI {
    /** Liste des topics connus. */
    listTopics(): Promise<string[]>;
    /** Dernier message d'un topic. */
    getMessage(topic: string): Promise<MQTTMessage | undefined>;
    /** Tous les messages, filtre optionnel. */
    getAllMessages(filter?: { topic?: string; after?: number }): Promise<MQTTMessage[]>;
    /** Publie (immédiat ou différé). */
    publish(topic: string, payload: Uint8Array, options?: MQTTPublishOptions): Promise<void>;
    /** File des messages programmés. */
    listScheduled(): Promise<ScheduledMessage[]>;
    /** Annule un message programmé. */
    cancelScheduled(id: number): Promise<void>;
    /** État courant de la connexion. */
    getConnectionStatus(): Promise<MQTTConnectionStatus>;
}

export interface ConfigAPI {
    getConfig<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]>;
    setConfig(values: Partial<AppConfig>): Promise<void>;
}

/* =========================================================================
 * 6. Assemblage : types applicatifs
 *    -> équiv. `AppTypes extends BaseAppTypes` du bootstrap Dagda.
 * ========================================================================= */

export interface MqttAppTypes {
    /** Pas d'entities à ce stade (la config n'est pas une entity). */
    entities: Record<string, never>;
    contexts: unknown;
    apis: MqttAPI & ConfigAPI;
    events: AppEvents;
    /** Schéma de config, consommé par ConfigService<AppConfig>. */
    config: AppConfig;
}

/* =========================================================================
 * 7. Web components du dashboard (réactifs aux events)
 *    Attributs figés ici pour mémoire ; réagissent à `mqttMessage`.
 * ========================================================================= */

/**
 * <mqtt-value topic="...">                       valeur brute
 * <mqtt-json  topic="..." path=".a.b">           valeur extraite d'un JSON
 * <mqtt-age   topic="...">                        temps écoulé depuis le dernier message
 * <mqtt-date  topic="...">                        formatage d'un timestamp
 * <mqtt-if    topic="..." path=".x" equals="on">  affichage conditionnel
 */
export type DashboardComponentTag =
    | "mqtt-value"
    | "mqtt-json"
    | "mqtt-age"
    | "mqtt-date"
    | "mqtt-if";

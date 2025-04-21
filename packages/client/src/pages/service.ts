import { BasePageTypes, PageHandler } from "./handler";

export type PageService<PageTypes extends BasePageTypes = BasePageTypes> = {
    "pages": PageHandler<PageTypes>;
}
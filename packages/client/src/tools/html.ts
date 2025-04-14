/** Apply template as innerHTML of the definition */
export function applyTemplate<Data = undefined>(destination: HTMLElement, template: string, data: Data): void {
    // Load template
    const compiledTemplate = Handlebars.compile(template);
    // Set content
    destination.innerHTML = compiledTemplate(data, {
        allowProtoPropertiesByDefault: false,
        allowProtoMethodsByDefault: false
    });
}
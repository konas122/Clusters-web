export class Config {
    private _DEBUG: boolean = localStorage.getItem('config_debug') === 'true'
    private _Layout: string = localStorage.getItem('config_layout') || 'xx'
    private _Model: string = localStorage.getItem('config_model') || 'Dragon'

    private static instance: Config

    public static get(): Config {
        if (!Config.instance) {
            Config.instance = new Config()
        }
        return Config.instance
    }

    public static getModelPath(): string {
        switch (Config.get().Model) {
            case "Dragon":
                return "./models/dragon.obj"
            case "Teapot":
                return "./models/teapot.obj"
            case "Armadillo":
                return "./models/armadillo.obj"
            case "Bunny":
                return "./models/bunny.obj"
            default:
                return "./models/dragon.obj"
        }
    }

    public static getLayout(): string {
        switch (Config.get().Layout.toLowerCase()) {
            case 'x':
                return 'x'
            case 'xx':
                return 'xx'
            case 'xxx':
                return 'xxx';
            default:
                return 'xx'
        }
    }

    get DEBUG(): boolean {
        return this._DEBUG
    }

    set DEBUG(value: boolean) {
        this._DEBUG = value
        localStorage.setItem('config_debug', value.toString())
    }

    get Layout(): string {
        return this._Layout
    }

    set Layout(value: string) {
        this._Layout = value
        localStorage.setItem('config_layout', value)
    }

    get Model(): string {
        return this._Model
    }

    set Model(value: string) {
        this._Model = value
        localStorage.setItem('config_model', value)
    }
}

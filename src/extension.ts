import * as vscode from 'vscode';

// #region Constants and Configurations

// Define the kinds of symbols that are considered for folding
const CLASS_AND_INTERFACE_SYMBOL_KINDS = [vscode.SymbolKind.Class, vscode.SymbolKind.Interface];
const FUNCTION_SYMBOL_KINDS = [vscode.SymbolKind.Method, vscode.SymbolKind.Function];
const TARGET_SYMBOL_KINDS = [...CLASS_AND_INTERFACE_SYMBOL_KINDS, ...FUNCTION_SYMBOL_KINDS, vscode.SymbolKind.Property, vscode.SymbolKind.Constructor, vscode.SymbolKind.Operator];

export type FoldClassAndInterfaceType = 'None' | 'Inner class' | 'All';

export type ConfigType = {
    foldRegion: boolean;
    foldImport: boolean;
    foldComment: boolean;
    foldClassAndInterface: FoldClassAndInterfaceType;
    foldInnerClass: boolean;
    foldLocalFunction: boolean;
    foldOnFileOpen: boolean;
};

const config: ConfigType = {
    foldRegion: true,
    foldImport: true,
    foldComment: true,
    foldClassAndInterface: 'None',
    foldInnerClass: false,
    foldLocalFunction: false,
    foldOnFileOpen: false,
};

// #endregion

// #region VS Code Extension Activation and Deactivation

export function activate(context: vscode.ExtensionContext) {
    // Register the configuration change listener to update the config when settings change
    updateConfig();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        console.log(`Configuration changed: ${event.affectsConfiguration('foldToDefinitions')}`);
        event.affectsConfiguration('foldToDefinitions') && updateConfig();
    }));

    // Register the folding command to be executed when a file is opened
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => {
        console.log(`File opened: ${document.uri.toString()}`);
        config.foldOnFileOpen && foldToDefinitions(document);
    }));

    // Register the command to fold to definitions
    context.subscriptions.push(vscode.commands.registerCommand('foldToDefinitions.fold', foldToDefinitions));

    // #region function updateConfig()

    function updateConfig() {
        console.log("Updating configuration from settings");
        const configuration = vscode.workspace.getConfiguration('foldToDefinitions');
        config.foldRegion = configuration.get<boolean>('foldRegion') ?? config.foldRegion;
        config.foldImport = configuration.get<boolean>('foldImport') ?? config.foldImport;
        config.foldComment = configuration.get<boolean>('foldComment') ?? config.foldComment;
        config.foldClassAndInterface = configuration.get<FoldClassAndInterfaceType>('foldClassAndInterface') ?? config.foldClassAndInterface;
        config.foldInnerClass = configuration.get<boolean>('foldInnerClass') ?? config.foldInnerClass;
        config.foldLocalFunction = configuration.get<boolean>('foldLocalFunction') ?? config.foldLocalFunction;
        config.foldOnFileOpen = configuration.get<boolean>('foldOnFileOpen') ?? config.foldOnFileOpen;
    }

    // #endregion
}

export function deactivate() { }

// #endregion

// #region Folding Logic

/**
 * Folds the editor view to show only code definitions
 * @async
 * @returns {Promise<void>} Resolves when folding is complete or if no folding is necessary.
 */
async function foldToDefinitions(document?: vscode.TextDocument) {
    // Get current active editor
    if (!document) {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor === undefined) {
            return;
        }
        document = activeEditor.document;
    }
    console.log(`Folding to definitions in: ${document.uri.toString()}`);

    // Find all symbols to fold
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | undefined>("vscode.executeDocumentSymbolProvider", document.uri)
        ?? [];
    const symbolsToFold = findSymbolsToFold(symbols);

    // Find all folding range to fold
    const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[] | undefined>("vscode.executeFoldingRangeProvider", document.uri)
        ?? [];
    const foldingRangesToFold = foldingRanges.filter(item =>
        (config.foldComment && item.kind === vscode.FoldingRangeKind.Comment)
        || (config.foldImport && item.kind === vscode.FoldingRangeKind.Imports)
        || (config.foldRegion && item.kind === vscode.FoldingRangeKind.Region)
    );

    console.log("Symbols", symbols);
    console.log("Folding Range", foldingRanges);

    const lineToFold = [...symbolsToFold.map(item => item.range.start.line), ...foldingRangesToFold.map(item => item.start)];
    if (lineToFold.length === 0) {
        return;
    }

    for (const symbol of symbolsToFold) {
        console.log("Folding", vscode.SymbolKind[symbol.kind], symbol.name, "in line", symbol.selectionRange.start.line + 1);
    }

    // Unfolding all then fold all valid line
    await vscode.commands.executeCommand("editor.unfoldAll");
    await vscode.commands.executeCommand("editor.fold", { selectionLines: lineToFold });
}

/**
 * Recursively finds and returns all symbols from the given source array that should be folded,
 * based on their kind and the kinds of their ancestor symbols.
 * @param source - An array of `vscode.DocumentSymbol` objects to search for foldable symbols.
 * @param _ancestorsSymbolKinds - A set of symbol kinds representing the ancestors of the symbol.
 * @returns An array of `vscode.DocumentSymbol` objects that are eligible for folding.
 */
function findSymbolsToFold(source: vscode.DocumentSymbol[]) {
    return innerFunction(source, new Set(), source);
    function innerFunction(source: vscode.DocumentSymbol[], ancestorsSymbolKinds: Set<vscode.SymbolKind>, topLevelSymbols: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
        return source.flatMap(symbol => [
            ...(isToFoldSymbol(symbol, ancestorsSymbolKinds, topLevelSymbols) ? [symbol] : []),
            ...innerFunction(symbol.children, new Set([...ancestorsSymbolKinds, symbol.kind]), topLevelSymbols)
        ]);
    }
}

/**
 * Determines whether a given symbol should be folded in the editor based on its kind,
 * ancestry, and user configuration.
 * @param symbol - The document symbol to evaluate for folding.
 * @param ancestorsSymbolKinds - A set of symbol kinds representing the ancestors of the symbol.
 * @param _config - Optional configuration object that overrides the default folding settings. (Mainly used for testing)
 * @returns `true` if the symbol should be folded, `false` otherwise.
 */
export function isToFoldSymbol(symbol: vscode.DocumentSymbol, ancestorsSymbolKinds: Set<vscode.SymbolKind>, topLevelSymbols: vscode.DocumentSymbol[], _config?: ConfigType) {
    _config ??= config;

    // No need to fold single line
    if (symbol.range.isSingleLine) {
        return false;
    }

    // fold if symbol is one of the target symbol, unless:
    // - it's local function and config.foldLocalFunction is false
    // - it's class or interface and config.foldClass is false
    // - it's inner class or interface and config.foldInnerClass is false

    const isSearchSymbol = TARGET_SYMBOL_KINDS.includes(symbol.kind);
    if (!isSearchSymbol) {
        return false;
    }

    const isLocalFunction = FUNCTION_SYMBOL_KINDS.some(kind => ancestorsSymbolKinds.has(kind))
        && FUNCTION_SYMBOL_KINDS.includes(symbol.kind);

    const isClassSymbol = CLASS_AND_INTERFACE_SYMBOL_KINDS.includes(symbol.kind);

    // Only do inner class checking if foldClassAndInterface is set to 'Inner class'
    const isInnerClassSymbol = _config.foldClassAndInterface === 'Inner class'
        && isClassSymbol
        && (
            CLASS_AND_INTERFACE_SYMBOL_KINDS.some(kind => ancestorsSymbolKinds.has(kind))
            // Omnisharp will flatten the class and interface hierarchy, so we need to check if there is a top-level symbol that is actually a inner class or interface
            || (
                topLevelSymbols
                .filter(topLevelSymbol => CLASS_AND_INTERFACE_SYMBOL_KINDS.includes(topLevelSymbol.kind))
                .some(topLevelSymbol =>
                    topLevelSymbol.range.start.isBefore(symbol.range.start)
                    && topLevelSymbol.range.end.isAfter(symbol.range.end)
                ))
        );

    return !(isLocalFunction && !_config.foldLocalFunction)
        && !(isClassSymbol && !isInnerClassSymbol && _config.foldClassAndInterface !== 'All')
        && !(isInnerClassSymbol && _config.foldClassAndInterface !== 'All' && _config.foldClassAndInterface !== 'Inner class');
}

// #endregion
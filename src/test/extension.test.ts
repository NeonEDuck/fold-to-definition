import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { ConfigType, isToFoldSymbol } from '../extension';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    // Helper to create a fresh config object for each test
    function createConfig(): ConfigType {
        return {
            foldComment: true,
            foldImport: true,
            foldRegion: true,
            foldClassAndInterface: 'None',
            foldInnerClass: false,
            foldLocalFunction: false,
        };
    }

    // Helper to create a mock DocumentSymbol
    function mockSymbol(kind: vscode.SymbolKind, start: number, end: number) {
        const isSingleLine = start === end;
        return {
            kind,
            range: new vscode.Range(new vscode.Position(start, 0), new vscode.Position(end, 0)),
            selectionRange: {} as vscode.Range,
            name: '',
            detail: '',
            children: [],
            tags: [],
        } satisfies vscode.DocumentSymbol;
    }

    let config: ConfigType;

    suite('isToFoldSymbol', () => {
        setup(() => {
            // Create a fresh config before each test
            config = createConfig();
        });

        test('returns false for single line symbol', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Function, 0, 0);
            const result = isToFoldSymbol(symbol, new Set(), [symbol], config);
            assert.strictEqual(result, false);
        });

        test('returns true for top-level function by default', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Function, 0, 2);
            const result = isToFoldSymbol(symbol, new Set(), [symbol], config);
            assert.strictEqual(result, true);
        });

        test('returns false for local function when foldLocalFunction is false', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Function, 0, 2);
            const ancestors = new Set([vscode.SymbolKind.Function]);
            config.foldLocalFunction = false;
            const result = isToFoldSymbol(symbol, ancestors, [symbol], config);
            assert.strictEqual(result, false);
        });

        test('returns true for local function when foldLocalFunction is true', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Function, 0, 2);
            const ancestors = new Set([vscode.SymbolKind.Function]);
            config.foldLocalFunction = true;
            const result = isToFoldSymbol(symbol, ancestors, [symbol], config);
            assert.strictEqual(result, true);
        });

        test('returns false for outer class when foldClassAndInterface is None', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 0, 2);
            config.foldClassAndInterface = 'None';
            const result = isToFoldSymbol(symbol, new Set(), [symbol], config);
            assert.strictEqual(result, false);
        });

        test('returns false for outer class when foldClassAndInterface is Inner class', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 0, 2);
            config.foldClassAndInterface = 'Inner class';
            const result = isToFoldSymbol(symbol, new Set(), [symbol], config);
            assert.strictEqual(result, false);
        });

        test('returns false for outer class when foldClassAndInterface is Inner class (Omnisharp)', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 11, 20);
            const topLevelSymbols = [symbol, mockSymbol(vscode.SymbolKind.Class, 0, 10)];
            config.foldClassAndInterface = 'Inner class';
            const result = isToFoldSymbol(symbol, new Set(), topLevelSymbols, config);
            assert.strictEqual(result, false);
        });

        test('returns true for outer class when foldClassAndInterface is All', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 0, 2);
            config.foldClassAndInterface = 'All';
            const result = isToFoldSymbol(symbol, new Set(), [symbol], config);
            assert.strictEqual(result, true);
        });

        test('returns false for inner class when foldClassAndInterface is None', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 0, 2);
            const ancestors = new Set([vscode.SymbolKind.Class]);
            const topLevelSymbols = [mockSymbol(vscode.SymbolKind.Class, 0, 10)];
            config.foldClassAndInterface = 'None';
            const result = isToFoldSymbol(symbol, ancestors, topLevelSymbols, config);
            assert.strictEqual(result, false);
        });

        test('returns true for inner class when foldClassAndInterface is Inner class', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 1, 9);
            const ancestors = new Set([vscode.SymbolKind.Class]);
            const topLevelSymbols = [mockSymbol(vscode.SymbolKind.Class, 0, 10)];
            config.foldClassAndInterface = 'Inner class';
            const result = isToFoldSymbol(symbol, ancestors, topLevelSymbols, config);
            assert.strictEqual(result, true);
        });

        test('returns true for inner class when foldClassAndInterface is Inner class (Omnisharp)', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 1, 9);
            const topLevelSymbols = [symbol, mockSymbol(vscode.SymbolKind.Class, 0, 10)];
            config.foldClassAndInterface = 'Inner class';
            const result = isToFoldSymbol(symbol, new Set(), topLevelSymbols, config);
            assert.strictEqual(result, true);
        });

        test('returns true for inner class when foldClassAndInterface is All', () => {
            const symbol = mockSymbol(vscode.SymbolKind.Class, 1, 9);
            const ancestors = new Set([vscode.SymbolKind.Class]);
            const topLevelSymbols = [mockSymbol(vscode.SymbolKind.Class, 0, 10)];
            config.foldClassAndInterface = 'All';
            const result = isToFoldSymbol(symbol, ancestors, topLevelSymbols, config);
            assert.strictEqual(result, true);
        });
    });
});

///<reference path="./tsc.d.ts" />
///<reference path="./grunt.d.ts" />
var GruntTs;
(function (GruntTs) {
    var _fs = require('fs');
    var _path = require('path');
    var _os = require('os');

    function writeError(str) {
        console.log('>> '.red + str.trim().replace(/\n/g, '\n>> '.red));
    }
    function writeInfo(str) {
        console.log('>> '.cyan + str.trim().replace(/\n/g, '\n>> '.cyan));
    }

    function normalizePath(path) {
        if (Object.prototype.toString.call(path) === "[object String]") {
            return path.replace(/\\/g, "/");
        }
        return path;
    }

    var _currentPath = normalizePath(_path.resolve("."));

    function currentPath() {
        return _currentPath;
    }

    function readFile(file, codepage) {
        if (codepage !== null) {
            throw new Error(TypeScript.getDiagnosticMessage(TypeScript.DiagnosticCode.codepage_option_not_supported_on_current_platform, null));
        }

        var buffer = _fs.readFileSync(file);
        switch (buffer[0]) {
            case 0xFE:
                if (buffer[1] === 0xFF) {
                    // utf16-be. Reading the buffer as big endian is not supported, so convert it to
                    // Little Endian first
                    var i = 0;
                    while ((i + 1) < buffer.length) {
                        var temp = buffer[i];
                        buffer[i] = buffer[i + 1];
                        buffer[i + 1] = temp;
                        i += 2;
                    }
                    return new TypeScript.FileInformation(buffer.toString("ucs2", 2), 2 /* Utf16BigEndian */);
                }
                break;
            case 0xFF:
                if (buffer[1] === 0xFE) {
                    // utf16-le
                    return new TypeScript.FileInformation(buffer.toString("ucs2", 2), 3 /* Utf16LittleEndian */);
                }
                break;
            case 0xEF:
                if (buffer[1] === 0xBB) {
                    // utf-8
                    return new TypeScript.FileInformation(buffer.toString("utf8", 3), 1 /* Utf8 */);
                }
        }

        // Default behaviour
        return new TypeScript.FileInformation(buffer.toString("utf8", 0), 0 /* None */);
    }

    function writeFile(path, contents, writeByteOrderMark) {
        function mkdirRecursiveSync(path) {
            var stats = _fs.statSync(path);
            if (stats.isFile()) {
                throw "\"" + path + "\" exists but isn't a directory.";
            } else if (stats.isDirectory()) {
                return;
            } else {
                mkdirRecursiveSync(_path.dirname(path));
                _fs.mkdirSync(path, 509);
            }
        }
        mkdirRecursiveSync(_path.dirname(path));

        if (writeByteOrderMark) {
            contents = '\uFEFF' + contents;
        }

        var chunkLength = 4 * 1024;
        var fileDescriptor = _fs.openSync(path, "w");
        try  {
            for (var index = 0; index < contents.length; index += chunkLength) {
                var buffer = new Buffer(contents.substr(index, chunkLength), "utf8");

                _fs.writeSync(fileDescriptor, buffer, 0, buffer.length, null);
            }
        } finally {
            _fs.closeSync(fileDescriptor);
        }
    }

    var GruntIO = (function () {
        function GruntIO(grunt) {
            this.grunt = grunt;
            this.stderr = {
                Write: function (str) {
                    return writeError(str);
                },
                WriteLine: function (str) {
                    return writeError(str);
                },
                Close: function () {
                }
            };
            this.stdout = {
                Write: function (str) {
                    return writeInfo(str);
                },
                WriteLine: function (str) {
                    return writeInfo(str);
                },
                Close: function () {
                }
            };
            this.arguments = process.argv.slice(2);
            //original
            this.newLine = _os.EOL;
        }
        GruntIO.prototype.readFile = function (file, codepage) {
            var result;
            try  {
                this.grunt.verbose.write("Reading " + file + "...");
                result = readFile(file, codepage);
                this.grunt.verbose.writeln("OK".green);
                return result;
            } catch (e) {
                this.grunt.verbose.writeln("");
                this.grunt.verbose.fail("Can't read file. " + e.message);
                throw e;
            }
        };

        GruntIO.prototype.writeFile = function (path, contents, writeByteOrderMark) {
            try  {
                this.grunt.verbose.write("Writing " + path + "...");
                writeFile(path, contents, writeByteOrderMark);
                this.grunt.verbose.writeln("OK".green);
            } catch (e) {
                this.grunt.verbose.writeln("");
                this.grunt.verbose.fail("Can't write file. " + e.message);
                throw e;
            }
        };

        GruntIO.prototype.deleteFile = function (path) {
            try  {
                this.grunt.verbose.write("Deleting " + path + "...");
                _fs.unlinkSync(path);
                this.grunt.verbose.writeln("OK".green);
            } catch (e) {
                this.grunt.verbose.writeln("");
                this.grunt.verbose.fail("Can't delete file. " + e.message);
                throw e;
            }
        };

        GruntIO.prototype.fileExists = function (path) {
            return _fs.existsSync(path);
        };

        GruntIO.prototype.dir = function (path, spec, options) {
            options = options || {};

            function filesInFolder(folder) {
                var paths = [];

                try  {
                    var files = _fs.readdirSync(folder);
                    for (var i = 0; i < files.length; i++) {
                        var stat = _fs.statSync(folder + "/" + files[i]);
                        if (options.recursive && stat.isDirectory()) {
                            paths = paths.concat(filesInFolder(folder + "/" + files[i]));
                        } else if (stat.isFile() && (!spec || files[i].match(spec))) {
                            paths.push(folder + "/" + files[i]);
                        }
                    }
                } catch (err) {
                }

                return paths;
            }

            return filesInFolder(path);
        };

        GruntIO.prototype.createDirectory = function (path) {
            if (!this.directoryExists(path)) {
                _fs.mkdirSync(path);
            }
        };

        GruntIO.prototype.directoryExists = function (path) {
            return _fs.existsSync(path) && _fs.statSync(path).isDirectory();
        };

        GruntIO.prototype.resolvePath = function (path) {
            return _path.resolve(path);
        };

        GruntIO.prototype.dirName = function (path) {
            var dirPath = _path.dirname(path);

            // Node will just continue to repeat the root path, rather than return null
            if (dirPath === path) {
                dirPath = null;
            }

            return dirPath;
        };

        GruntIO.prototype.findFile = function (rootPath, partialFilePath) {
            var path = rootPath + "/" + partialFilePath;

            while (true) {
                if (_fs.existsSync(path)) {
                    return { fileInformation: this.readFile(path, null), path: path };
                } else {
                    var parentPath = _path.resolve(rootPath, "..");

                    // Node will just continue to repeat the root path, rather than return null
                    if (rootPath === parentPath) {
                        return null;
                    } else {
                        rootPath = parentPath;
                        path = _path.resolve(rootPath, partialFilePath);
                    }
                }
            }
        };

        GruntIO.prototype.print = function (str) {
            this.stdout.Write(str);
        };

        GruntIO.prototype.printLine = function (str) {
            this.stdout.WriteLine(str);
        };

        GruntIO.prototype.watchFile = function (fileName, callback) {
            return null;
        };

        GruntIO.prototype.run = function (source, fileName) {
            return;
        };

        GruntIO.prototype.getExecutingFilePath = function () {
            return null;
        };

        GruntIO.prototype.quit = function (exitCode) {
            return;
        };

        //original method
        GruntIO.prototype.currentPath = function () {
            return currentPath();
        };

        //original method
        GruntIO.prototype.combine = function (left, right) {
            return normalizePath(_path.join(left, right));
        };

        //original
        GruntIO.prototype.relativePath = function (from, to) {
            return normalizePath(_path.relative(from, to));
        };

        //original
        GruntIO.prototype.resolveMulti = function () {
            var paths = [];
            for (var _i = 0; _i < (arguments.length - 0); _i++) {
                paths[_i] = arguments[_i + 0];
            }
            return normalizePath(_path.resolve.apply(_path, paths));
        };

        GruntIO.prototype.normalizePath = function (path) {
            return normalizePath(path);
        };
        return GruntIO;
    })();
    GruntTs.GruntIO = GruntIO;
})(GruntTs || (GruntTs = {}));
///<reference path="./grunt.d.ts" />
///<reference path="./tsc.d.ts" />
///<reference path="./io.ts" />
var GruntTs;
(function (GruntTs) {
    var _path = require("path");

    function createCompilationSettings(options, dest, ioHost) {
        var settings = new TypeScript.CompilationSettings(), temp;

        if (options.fullSourceMapPath) {
            ioHost.printLine("fullSourceMapPath not supported.");
        }
        if (options.allowbool) {
            ioHost.printLine("allowbool is obsolete.");
        }
        if (options.allowimportmodule) {
            ioHost.printLine("allowimportmodule is obsolete.");
        }

        if (options.outputOne) {
            dest = _path.resolve(ioHost.currentPath(), dest);
            settings.outFileOption = dest;
        }
        if (options.sourcemap) {
            settings.mapSourceFiles = true;
        }
        if (options.declaration) {
            settings.generateDeclarationFiles = true;
        }
        if (options.comments) {
            settings.removeComments = false;
        } else {
            settings.removeComments = true;
        }

        //default
        settings.codeGenTarget = 0 /* EcmaScript3 */;
        if (options.target) {
            temp = options.target.toLowerCase();
            if (temp === 'es3') {
                settings.codeGenTarget = 0 /* EcmaScript3 */;
            } else if (temp == 'es5') {
                settings.codeGenTarget = 1 /* EcmaScript5 */;
            }
        }

        //default
        settings.moduleGenTarget = 1 /* Synchronous */;
        if (options.module) {
            temp = options.module.toLowerCase();
            if (temp === 'commonjs' || temp === 'node') {
                settings.moduleGenTarget = 1 /* Synchronous */;
            } else if (temp === 'amd') {
                settings.moduleGenTarget = 2 /* Asynchronous */;
            }
        }
        if (options.noImplicitAny) {
            settings.noImplicitAny = true;
        }

        if (options.nolib) {
            settings.noLib = true;
        }

        //test
        if (options.disallowAsi) {
            settings.allowAutomaticSemicolonInsertion = false;
        }

        return TypeScript.ImmutableCompilationSettings.fromCompilationSettings(settings);
    }
    GruntTs.createCompilationSettings = createCompilationSettings;
})(GruntTs || (GruntTs = {}));
///<reference path="./grunt.d.ts" />
///<reference path="./tsc.d.ts" />
///<reference path="./io.ts" />
///<reference path="./setting.ts" />
var GruntTs;
(function (GruntTs) {
    var SourceFile = (function () {
        function SourceFile(scriptSnapshot, byteOrderMark) {
            this.scriptSnapshot = scriptSnapshot;
            this.byteOrderMark = byteOrderMark;
        }
        return SourceFile;
    })();

    var CompilerPhase;
    (function (CompilerPhase) {
        CompilerPhase[CompilerPhase["Syntax"] = 0] = "Syntax";
        CompilerPhase[CompilerPhase["Semantics"] = 1] = "Semantics";
        CompilerPhase[CompilerPhase["EmitOptionsValidation"] = 2] = "EmitOptionsValidation";
        CompilerPhase[CompilerPhase["Emit"] = 3] = "Emit";
        CompilerPhase[CompilerPhase["DeclarationEmit"] = 4] = "DeclarationEmit";
    })(CompilerPhase || (CompilerPhase = {}));

    var Compiler = (function () {
        function Compiler(grunt, tscBinPath, ioHost) {
            this.grunt = grunt;
            this.tscBinPath = tscBinPath;
            this.ioHost = ioHost;
            this.fileNameToSourceFile = new TypeScript.StringHashTable();
            this.hasErrors = false;
            this.resolvedFiles = [];
            this.logger = null;
            this.outputFiles = [];
            this.fileExistsCache = TypeScript.createIntrinsicsObject();
            this.resolvePathCache = TypeScript.createIntrinsicsObject();
        }
        Compiler.prototype.exec = function (files, dest, options) {
            this.destinationPath = dest;
            this.options = options;
            this.compilationSettings = GruntTs.createCompilationSettings(options, dest, this.ioHost);
            this.inputFiles = files;
            this.logger = new TypeScript.NullLogger();

            try  {
                this.resolve();
                this.compile();
            } catch (e) {
                return false;
            }

            this.writeResult();

            return true;
        };

        Compiler.prototype.resolve = function () {
            var _this = this;
            var resolvedFiles = [];
            var resolutionResults = TypeScript.ReferenceResolver.resolve(this.inputFiles, this, this.compilationSettings.useCaseSensitiveFileResolution());
            var includeDefaultLibrary = !this.compilationSettings.noLib() && !resolutionResults.seenNoDefaultLibTag;

            resolvedFiles = resolutionResults.resolvedFiles;

            resolutionResults.diagnostics.forEach(function (d) {
                return _this.addDiagnostic(d);
            });

            if (includeDefaultLibrary) {
                var libraryResolvedFile = {
                    path: this.ioHost.combine(this.tscBinPath, "lib.d.ts"),
                    referencedFiles: [],
                    importedFiles: []
                };

                // Prepend the library to the resolved list
                resolvedFiles = [libraryResolvedFile].concat(resolvedFiles);
            }

            this.resolvedFiles = resolvedFiles;
        };

        Compiler.prototype.compile = function () {
            var _this = this;
            var compiler = new TypeScript.TypeScriptCompiler(this.logger, this.compilationSettings);

            this.resolvedFiles.forEach(function (resolvedFile) {
                var sourceFile = _this.getSourceFile(resolvedFile.path);
                compiler.addFile(resolvedFile.path, sourceFile.scriptSnapshot, sourceFile.byteOrderMark, /*version:*/ 0, false, resolvedFile.referencedFiles);
            });

            for (var it = compiler.compile(function (path) {
                return _this.resolvePath(path);
            }); it.moveNext();) {
                var result = it.current(), hasError = false, phase = it.compilerPhase;

                result.diagnostics.forEach(function (d) {
                    var info = d.info();
                    if (info.category === 1 /* Error */) {
                        hasError = true;
                    }
                    _this.addDiagnostic(d);
                });
                if (hasError && phase === 0 /* Syntax */) {
                    throw new Error();
                }
                if (hasError && !this.options.ignoreTypeCheck) {
                    throw new Error();
                }

                if (!this.tryWriteOutputFiles(result.outputFiles)) {
                    throw new Error();
                }
            }
        };

        Compiler.prototype.writeResult = function () {
            var result = { js: [], m: [], d: [], other: [] }, resultMessage, pluralizeFile = function (n) {
                return (n + " file") + ((n === 1) ? "" : "s");
            };
            this.outputFiles.forEach(function (item) {
                if (/\.js$/.test(item))
                    result.js.push(item);
                else if (/\.js\.map$/.test(item))
                    result.m.push(item);
                else if (/\.d\.ts$/.test(item))
                    result.d.push(item);
                else
                    result.other.push(item);
            });

            resultMessage = "js: " + pluralizeFile(result.js.length) + ", map: " + pluralizeFile(result.m.length) + ", declaration: " + pluralizeFile(result.d.length);
            if (this.options.outputOne) {
                if (result.js.length > 0) {
                    this.grunt.log.writeln("File " + (result.js[0])["cyan"] + " created.");
                }
                this.grunt.log.writeln(resultMessage);
            } else {
                this.grunt.log.writeln(pluralizeFile(this.outputFiles.length)["cyan"] + " created. " + resultMessage);
            }
        };

        Compiler.prototype.getScriptSnapshot = function (fileName) {
            return this.getSourceFile(fileName).scriptSnapshot;
        };

        Compiler.prototype.getSourceFile = function (fileName) {
            var sourceFile = this.fileNameToSourceFile.lookup(fileName);
            if (!sourceFile) {
                // Attempt to read the file
                var fileInformation;

                try  {
                    fileInformation = this.ioHost.readFile(fileName, this.compilationSettings.codepage());
                } catch (e) {
                    fileInformation = new TypeScript.FileInformation("", 0 /* None */);
                }

                var snapshot = TypeScript.ScriptSnapshot.fromString(fileInformation.contents);
                sourceFile = new SourceFile(snapshot, fileInformation.byteOrderMark);
                this.fileNameToSourceFile.add(fileName, sourceFile);
            }

            return sourceFile;
        };

        Compiler.prototype.resolveRelativePath = function (path, directory) {
            var unQuotedPath = TypeScript.stripStartAndEndQuotes(path);
            var normalizedPath;

            if (TypeScript.isRooted(unQuotedPath) || !directory) {
                normalizedPath = unQuotedPath;
            } else {
                normalizedPath = this.ioHost.combine(directory, unQuotedPath);
            }
            normalizedPath = this.resolvePath(normalizedPath);
            normalizedPath = TypeScript.switchToForwardSlashes(normalizedPath);
            return normalizedPath;
        };

        Compiler.prototype.fileExists = function (path) {
            var exists = this.fileExistsCache[path];
            if (exists === undefined) {
                exists = this.ioHost.fileExists(path);
                this.fileExistsCache[path] = exists;
            }
            return exists;
        };

        Compiler.prototype.getParentDirectory = function (path) {
            return this.ioHost.dirName(path);
        };

        Compiler.prototype.addDiagnostic = function (diagnostic) {
            var diagnosticInfo = diagnostic.info();
            if (diagnosticInfo.category === 1 /* Error */) {
                this.hasErrors = true;
            }

            if (diagnostic.fileName()) {
                this.ioHost.stderr.Write(diagnostic.fileName() + "(" + (diagnostic.line() + 1) + "," + (diagnostic.character() + 1) + "): ");
            }

            this.ioHost.stderr.WriteLine(diagnostic.message());
        };

        Compiler.prototype.tryWriteOutputFiles = function (outputFiles) {
            for (var i = 0, n = outputFiles.length; i < n; i++) {
                var outputFile = outputFiles[i];

                try  {
                    this.writeFile(outputFile.name, outputFile.text, outputFile.writeByteOrderMark);
                } catch (e) {
                    this.addDiagnostic(new TypeScript.Diagnostic(outputFile.name, null, 0, 0, TypeScript.DiagnosticCode.Emit_Error_0, [e.message]));
                    return false;
                }
            }

            return true;
        };

        Compiler.prototype.writeFile = function (fileName, contents, writeByteOrderMark) {
            var preparedFileName = this.prepareFileName(fileName);
            var path = this.ioHost.resolvePath(preparedFileName);
            var dirName = this.ioHost.dirName(path);
            this.createDirectoryStructure(dirName);

            contents = this.prepareSourcePath(fileName, preparedFileName, contents);

            this.ioHost.writeFile(path, contents, writeByteOrderMark);

            this.outputFiles.push(path);
        };

        Compiler.prototype.prepareFileName = function (fileName) {
            var newFileName = fileName, basePath = this.options.base_path;

            if (this.options.outputOne) {
                return newFileName;
            }
            if (!this.destinationPath) {
                return newFileName;
            }

            var currentPath = this.ioHost.currentPath(), relativePath = this.ioHost.relativePath(currentPath, fileName);

            if (basePath) {
                if (relativePath.substr(0, basePath.length) !== basePath) {
                    throw new Error(fileName + " is not started base_path");
                }
                relativePath = relativePath.substr(basePath.length);
            }

            return this.ioHost.resolveMulti(currentPath, this.destinationPath, relativePath);
        };

        Compiler.prototype.prepareSourcePath = function (sourceFileName, preparedFileName, contents) {
            var io = this.ioHost;
            if (this.options.outputOne) {
                return contents;
            }
            if (sourceFileName === preparedFileName) {
                return contents;
            }
            if (!this.destinationPath) {
                return contents;
            }
            if (!(/\.js\.map$/.test(sourceFileName))) {
                return contents;
            }
            var mapData = JSON.parse(contents), source = mapData.sources[0];
            mapData.sources.length = 0;
            var relative = io.relativePath(io.dirName(preparedFileName), sourceFileName);
            mapData.sources.push(io.combine(io.dirName(relative), source));
            return JSON.stringify(mapData);
        };

        Compiler.prototype.createDirectoryStructure = function (dirName) {
            if (this.ioHost.directoryExists(dirName)) {
                return;
            }

            var parentDirectory = this.ioHost.dirName(dirName);
            if (parentDirectory != "") {
                this.createDirectoryStructure(parentDirectory);
            }
            this.ioHost.createDirectory(dirName);
        };

        Compiler.prototype.directoryExists = function (path) {
            return this.ioHost.directoryExists(path);
            ;
        };

        Compiler.prototype.resolvePath = function (path) {
            var cachedValue = this.resolvePathCache[path];
            if (!cachedValue) {
                cachedValue = this.ioHost.resolvePath(path);
                this.resolvePathCache[path] = cachedValue;
            }
            return cachedValue;
        };
        return Compiler;
    })();
    GruntTs.Compiler = Compiler;
})(GruntTs || (GruntTs = {}));
///<reference path="grunt.d.ts" />
///<reference path="io.ts" />
///<reference path="compiler.ts" />
module.exports = function (grunt) {
    var _path = require("path"), _vm = require('vm'), _os = require('os'), getTsBinPathWithLoad = function () {
        var typeScriptBinPath = _path.dirname(require.resolve("typescript")), typeScriptPath = _path.resolve(typeScriptBinPath, "typescript.js"), code;

        if (!typeScriptBinPath) {
            grunt.fail.warn("typescript.js not found. please 'npm install typescript'.");
            return false;
        }

        code = grunt.file.read(typeScriptPath);
        _vm.runInThisContext(code, typeScriptPath);

        return typeScriptBinPath;
    }, prepareBasePath = function (io, path) {
        if (!path) {
            return path;
        }
        path = io.normalizePath(path);
        if (path.lastIndexOf("/") !== path.length - 1) {
            path = path + "/";
        }
        return path;
    };

    grunt.registerMultiTask('typescript', 'Compile TypeScript files', function () {
        var self = this, typescriptBinPath = getTsBinPathWithLoad(), hasError = false;

        this.files.forEach(function (file) {
            var dest = file.dest, options = self.options(), files = [], io = new GruntTs.GruntIO(grunt), newlineOpt;

            TypeScript.newLine = function () {
                return _os.EOL;
            };
            if (options.newLine) {
                newlineOpt = options.newLine.toString().toLowerCase();
                if (newlineOpt === "crlf") {
                    TypeScript.newLine = function () {
                        return "\r\n";
                    };
                } else if (newlineOpt === "lf") {
                    TypeScript.newLine = function () {
                        return "\n";
                    };
                }
            }

            grunt.file.expand(file.src).forEach(function (file) {
                files.push(file);
            });

            dest = io.normalizePath(dest);

            options.outputOne = !!dest && _path.extname(dest) === ".js";

            options.base_path = prepareBasePath(io, options.base_path);
            if (options.base_path) {
                options.base_path = io.normalizePath(options.base_path);
            }
            if (typeof options.ignoreTypeCheck === "undefined") {
                options.ignoreTypeCheck = true;
            }

            if (!(new GruntTs.Compiler(grunt, typescriptBinPath, io)).exec(files, dest, options)) {
                hasError = true;
            }
        });
        if (hasError) {
            return false;
        }
        if (grunt.task.current.errorCount) {
            return false;
        }
    });
};

var registry = require('../../src/registry/registry'),
    manifest = require('../../src/registry/manifest'),
    fs = require('fs'),
    path = require('path'),
    Q = require('q'),
    shell   = require('shelljs'),
    os = require('os'),
    npm = require('npm');

describe('registry', function() {
    var done;
    beforeEach(function() {
        done = false;
    });
    function registryPromise(shouldSucceed, f) {
        waitsFor(function() { return done; }, 'promise never resolved', 500);
        return f.then(function() {
          done = true;
          expect(shouldSucceed).toBe(true);
        }, function(err) {
          done = err;
          expect(shouldSucceed).toBe(false);
        });
    }

    describe('manifest', function() {
        var pluginDir, packageJson, tmp_plugin, tmp_plugin_xml, tmp_package_json;
        beforeEach(function() {
            pluginDir = __dirname + '/../plugins/EnginePlugin';
            tmp_plugin = path.join(os.tmpdir(), 'plugin');
            tmp_plugin_xml = path.join(tmp_plugin, 'plugin.xml');
            tmp_package_json = path.join(tmp_plugin, 'package.json');
            shell.cp('-R', pluginDir+"/*", tmp_plugin);
        });
        afterEach(function() {
            shell.rm('-rf', tmp_plugin);
        });
        it('should generate a package.json from a plugin.xml', function() {
            registryPromise(true, manifest.generatePackageJsonFromPluginXml(tmp_plugin).then(function() {
                expect(fs.existsSync(tmp_package_json));
                var packageJson = JSON.parse(fs.readFileSync(tmp_package_json));
                expect(packageJson.name).toEqual('com.cordova.engine');
                expect(packageJson.version).toEqual('1.0.0');
                expect(packageJson.engines).toEqual(
                    [ { name : 'cordova', version : '>=2.3.0' }, { name : 'cordova-plugman', version : '>=0.10.0' }, { name : 'mega-fun-plugin', version : '>=1.0.0' }, { name : 'mega-boring-plugin', version : '>=3.0.0' } ]);
            }));
        });
        it('should raise an error if name does not follow com.domain.* format', function() {
            var xmlData = fs.readFileSync(tmp_plugin_xml).toString().replace('id="com.cordova.engine"', 'id="engine"');
            fs.writeFileSync(tmp_plugin_xml, xmlData);
            registryPromise(false, manifest.generatePackageJsonFromPluginXml(tmp_plugin));
        });
        it('should generate a package.json if name uses org.apache.cordova.* for a whitelisted plugin', function() {
            var xmlData = fs.readFileSync(tmp_plugin_xml).toString().replace('id="com.cordova.engine"', 'id="org.apache.cordova.camera"');
            fs.writeFileSync(tmp_plugin_xml, xmlData);
            registryPromise(true, manifest.generatePackageJsonFromPluginXml(tmp_plugin).then(function() {
                expect(!fs.existsSync(tmp_package_json));
            }));
        });
        it('should raise an error if name uses org.apache.cordova.* for a non-whitelisted plugin', function() {
            var xmlData = fs.readFileSync(tmp_plugin_xml).toString().replace('id="com.cordova.engine"', 'id="org.apache.cordova.myinvalidplugin"');
            fs.writeFileSync(tmp_plugin_xml, xmlData);
            registryPromise(false, manifest.generatePackageJsonFromPluginXml(tmp_plugin));
        });
    });
    describe('actions', function() {
        var fakeLoad, fakeNPMCommands;

        beforeEach(function() {
            done = false;
            var fakeSettings = {
                cache: '/some/cache/dir',
                logstream: 'somelogstream@2313213',
                userconfig: '/some/config/dir'
            };

            var fakeNPM = function() {
                if (arguments.length > 0) {
                    var cb = arguments[arguments.length-1];
                    if (cb && typeof cb === 'function') cb(null, true);
                }
            };

            registry.settings = fakeSettings;
            fakeLoad = spyOn(npm, 'load').andCallFake(function(settings, cb) { cb(null, true); });

            fakeNPMCommands = {};
            ['config', 'adduser', 'cache', 'publish', 'unpublish', 'search'].forEach(function(cmd) {
                fakeNPMCommands[cmd] = jasmine.createSpy(cmd).andCallFake(fakeNPM);
            });

            npm.commands = fakeNPMCommands;
        });
        it('should run config', function() {
            var params = ['set', 'registry', 'http://registry.cordova.io'];
            registryPromise(true, registry.config(params).then(function() {
                expect(fakeLoad).toHaveBeenCalledWith(registry.settings, jasmine.any(Function));
                expect(fakeNPMCommands.config).toHaveBeenCalledWith(params, jasmine.any(Function));
            }));
        });
        it('should run adduser', function() {
            registryPromise(true, registry.adduser(null).then(function() {
                expect(fakeLoad).toHaveBeenCalledWith(registry.settings, jasmine.any(Function));
                expect(fakeNPMCommands.adduser).toHaveBeenCalledWith(null, jasmine.any(Function));
            }));
        });
        it('should run publish', function() {
            var params = [__dirname + '/../plugins/DummyPlugin'];
            var spyGenerate = spyOn(manifest, 'generatePackageJsonFromPluginXml').andReturn(Q());
            var spyUnlink = spyOn(fs, 'unlink');
            registryPromise(true, registry.publish(params).then(function() {
                expect(fakeLoad).toHaveBeenCalledWith(registry.settings, jasmine.any(Function));
                expect(spyGenerate).toHaveBeenCalledWith(params[0]);
                expect(fakeNPMCommands.publish).toHaveBeenCalledWith(params, jasmine.any(Function));
                expect(spyUnlink).toHaveBeenCalledWith(path.resolve(params[0], 'package.json'));
            }));
        });
        it('should run unpublish', function() {
            var params = ['dummyplugin@0.6.0'];
            registryPromise(true, registry.unpublish(params).then(function() {
                expect(fakeLoad).toHaveBeenCalledWith(registry.settings, jasmine.any(Function));
                expect(fakeNPMCommands.unpublish).toHaveBeenCalledWith(params, jasmine.any(Function));
                expect(fakeNPMCommands.cache).toHaveBeenCalledWith(['clean'], jasmine.any(Function));
            }));
        });
        it('should run search', function() {
            var params = ['dummyplugin', 'plugin'];
            registryPromise(true, registry.search(params).then(function() {
                expect(fakeLoad).toHaveBeenCalledWith(registry.settings, jasmine.any(Function));
                expect(fakeNPMCommands.search).toHaveBeenCalledWith(params, true, jasmine.any(Function));
            }));
        });
    });
});

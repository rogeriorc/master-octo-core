'use strict';

global.__basedir = __dirname;

let path = require('path'),
	Q = require('q'),
	tools = require('totvstec-tools'),
	shelljs = require('shelljs'),
	AppServer = require('totvs-platform-helper/appserver'),
	TDS = require('totvs-platform-helper/tdscli');

const APPSERVER_DIR = path.join(__basedir, 'src', 'resources', 'appserver'),
	APPSERVER_EXE = process.platform === 'win32' ? 'appserver.exe' : 'appserver';

module.exports = function(grunt) {
	var pkg = grunt.file.readJSON('package.json');

	grunt.initConfig({

		pkg: pkg,

		components: {
			js: {
				name: 'master-octo-core',
				dist: path.join('build', 'dist', 'js')
			},
			advpl: {
				name: 'master-octo-core-advpl',
				dist: path.join('build', 'dist', 'advpl')
			}
		},

		clean: {
			dist: ['build']
		},

		ts: {
			dist: {
				tsconfig: true,
				options: {
					sourceMap: true,
					declaration: true
				}
			}
		},

		template: {
			js: {
				options: {
					data: function() {
						return {
							package: grunt.file.readJSON('package.json')
						};
					}
				},
				files: {
					'build/stagging/js/totvs-twebchannel.js': ['build/stagging/ts/totvs-twebchannel.js'],
					'build/stagging/js/promisequeue.js': ['build/stagging/ts/promisequeue.js']
				}
			}
		},

		concat: {
			dist: {
				src: [
					'src/resources/js/qwebchannel-5.7.0.js',
					'build/stagging/js/promisequeue.js',
					'build/stagging/js/totvs-twebchannel.js'
				],
				dest: '<%= components.js.dist %>/<%= components.js.name %>.js'
			}
		},

		uglify: {
			options: {
				compress: {
					warnings: false
				},
				mangle: true
			},
			dist: {
				src: '<%= concat.dist.dest %>',
				dest: '<%= components.js.dist %>/<%= components.js.name %>.min.js'
			}
		}

	});


	// These plugins provide necessary tasks.
	require('load-grunt-tasks')(grunt, { scope: 'devDependencies' });
	require('time-grunt')(grunt);

	grunt.registerTask('deploy', 'Deploy new artifacts to his repos', function(target) {
		let done = this.async(),
			releaseJs = require('./src/util/releases/master-octo-core-js'),
			releaseAdvpl = require('./src/util/releases/master-octo-core-advpl');

		Q().then(releaseJs)
			.then(releaseAdvpl)
			.then(done);
	});

	grunt.registerTask('compile', 'Compile AdvPL', function(target) {
		let done = this.async(),
			appserver = new AppServer({
				target: path.join(APPSERVER_DIR, APPSERVER_EXE),
				silent: true
			}),
			tds = new TDS({ silent: true }),
			tdsOptions = {
				serverType: "4GL",
				server: "127.0.0.1",
				port: -1,
				build: "7.00.150715P",
				environment: "ENVIRONMENT"
			};

		shelljs.mkdir('-p', path.join(__basedir, 'build', 'dist', 'advpl'));

		return appserver.start()
			.then(function() {
				tdsOptions.port = appserver.tcpPort;
				tdsOptions.build = appserver.build;
			})
			.then(function() {
				var options = Object.assign({
					recompile: true,
					program: [
						path.join(__basedir, 'src', 'components', 'advpl', 'src')
					],
					includes: [
						path.join(__basedir, 'src', 'resources', 'includes'),
						path.join(__basedir, 'src', 'components', 'advpl', 'includes')
					]
				}, tdsOptions);

				return tds.compile(options);
			})
			.then(function() {
				var options = Object.assign({
					fileResource: shelljs.ls(path.join(__basedir, 'src', 'components', 'advpl', 'src')),
					patchType: "ptm",
					saveLocal: path.join(__basedir, 'build', 'dist', 'advpl')
				}, tdsOptions);

				return tds.generatePatch(options);
			})
			.then(function() {
				return appserver.stop();
			})
			.then(() => {
				let from = path.join(__basedir, 'build', 'dist', 'tttp110.*'),
					to = path.join(__basedir, 'build', 'dist', 'advpl');

				shelljs.mv('-f', from, to);
			})
			.then(done);
	});

	grunt.registerTask('bump', 'Bump version', function(target) {
		let v1 = tools.version.read('package.json'),
			v2 = v1;

		if (target === 'dev') {
			v2 = tools.version.inc(v1, 'patch', 'SNAPSHOT');
		}
		else {
			v2 = tools.version.inc(v1, 'patch');
		}

		console.log('Bumping version from "' + v1 + '" to "' + v2 + '"\n');

		tools.version.write('package.json', v2);
	});

	grunt.registerTask('commit', 'Commit self', function(target) {
		let done = this.async(),
			git = tools.git,
			pkg = grunt.file.readJSON('package.json'),
			message = '"Version ' + pkg.version + '"';

		console.log('git commit all message ' + message);

		let promise = git.commit({ all: true, message: message })
			.then(() => {
				console.log('git push');

				return git.push();
			});

		if (target === 'tag') {
			promise
				.then(() => {
					console.log('git tag v' + pkg.version + ' message ' + message);

					return git.tag({ annotate: 'v' + pkg.version, message: message });
				})
				.then(() => {
					console.log('git push tags');

					return git.push({ tags: true });
				});
		}

		promise.then(done);
	});

	// Full distribution task.
	grunt.registerTask('dist', ['ts', 'template', 'concat', 'uglify', 'compile']);

	// Default task.
	grunt.registerTask('default', ['clean', 'dist']);

	grunt.registerTask('release', ['clean', 'bump:release', 'dist', 'deploy', 'commit:tag', 'bump:dev', 'commit']);

};


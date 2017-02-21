'use strict';

let path = require('path'),
	shelljs = require('shelljs'),
	Q = require('q'),
	AppServer = require('totvs-platform-helper/appserver'),
	TDS = require('totvs-platform-helper/tdscli'),
	git = require('totvstec-tools').git,
	version = require('totvstec-tools').version;

const APPSERVER_DIR = path.join(__basedir, 'src', 'resources', 'appserver'),
	APPSERVER_EXE = process.platform === 'win32' ? 'appserver.exe' : 'appserver',
	GITHUB_PREFIX = 'https://github.com/rogeriorc/',
	REPO_NAME = 'master-octo-core-advpl',
	TARGET_DIR = path.join(__basedir, 'build', 'release', 'advpl'),
	DIST_DIR = path.join(__basedir, 'build', 'dist', 'advpl'),
	FILES = ['package.json', 'bower.json'];

module.exports = function run() {
	return Q()
		.then(clean)
		.then(prepare)
		.then(checkout)
		.then(compile)
		.then(copy)
		.then(commit);
};

function clean() {
	shelljs.rm('-rf', DIST_DIR);
	shelljs.mkdir('-p', DIST_DIR);
}

function prepare() {
	let rpoOrigin = path.join(__basedir, 'src', 'resources', 'apo', 'tttp110.rpo'),
		rpoTarget = path.join(__basedir, 'build', 'dist', 'tttp110.rpo');

	shelljs.cp('-Rf', rpoOrigin, rpoTarget);
}

function compile() {
	let appserver = new AppServer({
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
				saveLocal: DIST_DIR
			}, tdsOptions);

			return tds.generatePatch(options);
		})
		.then(function() {
			return appserver.stop();
		})
		.then(function() {
			let from = path.join(__basedir, 'build', 'dist', 'tttp110.rpo'),
				to = path.join(DIST_DIR, 'tttp110.rpo');

			shelljs.mv('-f', from, to);
		});
}


function copy() {
	let origin = path.join(DIST_DIR, 'tttp110.rpo'),
		dest = path.join(TARGET_DIR, 'src', 'apo', 'tttp110.rpo');

	shelljs.mkdir('-p', path.dirname(dest));
	shelljs.cp('-Rf', origin, dest);

	origin = path.join(__basedir, 'src', 'resources', 'includes');
	dest = path.join(TARGET_DIR, 'build', 'advpl');

	shelljs.mkdir('-p', dest);
	shelljs.cp('-Rf', origin, dest);

	origin = path.join(__basedir, 'src', 'components', 'advpl', 'includes');
	shelljs.cp('-Rf', origin, dest);

	origin = path.join(DIST_DIR, 'tttp110.ptm');
	dest = path.join(TARGET_DIR, 'tttp110.ptm');
	shelljs.cp('-Rf', origin, dest);
}


function checkout() {
	let url = GITHUB_PREFIX + REPO_NAME + '.git',
		options = { cwd: TARGET_DIR };

	shelljs.rm('-rf', TARGET_DIR);
	shelljs.mkdir('-p', TARGET_DIR);

	return git.clone([url, '.'], { branch: 'master' }, options)
		.then(() => {
			return git.checkout({ B: 'master' }, options);
		});
}

function commit() {
	let packagePath = path.join(__basedir, 'package.json'),
		packageVersion = version.read(packagePath),
		message = '"Version ' + packageVersion + '"',
		options = { cwd: TARGET_DIR };

	for (let i = 0; i < FILES.length; i++) {
		let file = path.join(TARGET_DIR, FILES[i]);

		if (shelljs.test('-f', file)) {
			version.write(file, packageVersion);
		}
	}

	return git.commit({ all: true, message: message }, options)
		.then(() => {
			return git.push({}, options);
		})
		.then(() => {
			return git.tag({ annotate: 'v' + packageVersion, message: message }, options);
		})
		.then(() => {
			return git.push({ tags: true }, options);
		});
}

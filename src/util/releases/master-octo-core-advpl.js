let path = require('path'),
	fs = require('fs'),
	os = require('os'),
	shelljs = require('shelljs'),
	Q = require('q'),
	AppServer = require('totvs-platform-helper/appserver'),
	TDS = require('totvs-platform-helper/tdscli'),
	GitRepo = require(__basedir + '/src/util/git'),
	git = null;


const APPSERVER_DIR = path.join(__basedir, 'src', 'resources', 'appserver'),
	APPSERVER_EXE = os.platform() === 'win32' ? 'appserver.exe' : 'appserver',
	GITHUB_PREFIX = 'https://github.com/rogeriorc/',
	REPO_NAME = 'master-octo-core-advpl';

module.exports = function run() {
	git = new GitRepo({
		cwd: path.join(__basedir, 'build', 'release', REPO_NAME),
		url: GITHUB_PREFIX + REPO_NAME + '.git'
	});

	return Q()
		.then(clean)
		.then(checkout)
		.then(compile)
		.then(copy)
		.then(commit);
};

function clean() {
	let rpoDir = path.join(__basedir, 'build', 'dist', REPO_NAME),
		rpoFile = path.join(rpoDir, 'tttp110.*');

	shelljs.rm('-rf', rpoFile);
	shelljs.mkdir('-p', rpoDir);
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
				saveLocal: path.join(__basedir, 'build', 'dist', REPO_NAME)
			}, tdsOptions);

			return tds.generatePatch(options);
		})
		.then(function() {
			return appserver.stop();
		});
}


function copy() {
	let home = path.join(__basedir, 'build', 'release', REPO_NAME),
		origin = path.join(__basedir, 'build', 'dist', REPO_NAME, 'tttp110.rpo'),
		dest = path.join(home, 'src', 'apo', 'tttp110.rpo');

	shelljs.mkdir('-p', path.join(dest, '..'));
	shelljs.cp('-Rf', origin, dest);

	origin = path.join(__basedir, 'src', 'resources', 'includes');
	dest = path.join(home, 'build', 'advpl');

	shelljs.mkdir('-p', dest);
	shelljs.cp('-Rf', origin, dest);

	origin = path.join(__basedir, 'src', 'components', 'advpl', 'includes');
	shelljs.cp('-Rf', origin, dest);

	origin = path.join(__basedir, 'build', 'dist', REPO_NAME, 'tttp110.ptm');
	dest = path.join(home, 'tttp110.ptm');
	shelljs.cp('-Rf', origin, dest);
}



function checkout() {
	git.checkout();
}

function commit() {
	let packagePath = path.join(__basedir, 'package.json'),
		pkg = JSON.parse(fs.readFileSync(packagePath, { encoding: 'utf8' }));

	git.bump(pkg.version);

	git.commit("Version " + pkg.version);
	git.tag('v' + pkg.version, "Version " + pkg.version);
}

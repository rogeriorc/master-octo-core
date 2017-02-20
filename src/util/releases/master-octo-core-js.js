'use strict';

let path = require('path'),
	shelljs = require('shelljs'),
	Q = require('q'),
	git = require('totvstec-tools').git,
	version = require('totvstec-tools').version;

const GITHUB_PREFIX = 'https://github.com/rogeriorc/',
	REPO_NAME = 'master-octo-core-js',
	TARGET_DIR = path.join(__basedir, 'build', 'release', REPO_NAME),
	FILES = ['package.json', 'bower.json'];

module.exports = function run() {
	return Q()
		.then(checkout)
		.then(copy)
		.then(commit);
};

function copy() {
	let origin = path.join(__basedir, 'build', 'dist', REPO_NAME, '*.*'),
		dest = path.join(__basedir, 'build', 'release', REPO_NAME);

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

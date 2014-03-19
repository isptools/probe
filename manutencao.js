var sys = require('sys')
var exec = require('child_process').exec;

module.exports = {
  atualizar: function () {
    
  	console.log(Date());
  	exec("git status --porcelain", pull);
	//exec("git pull https://giovaneh@bitbucket.org/giovaneh/isptools.git", puts);

    return true;
  }
};
function puts(error, stdout, stderr) {
	sys.puts(stdout);
}
function pull(error, stdout, stderr) {
	console.log('------------');
	console.log(error);
	console.log('------------');
	console.log(stdout);
	console.log('------------');
	console.log(stderr);
	console.log('------------');
	// teste
}

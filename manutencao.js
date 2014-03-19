var sys = require('sys')
var exec = require('child_process').exec;

module.exports = {
  atualizar: function () {
    
  	console.log(Date());
	exec("git pull https://giovaneh@bitbucket.org/giovaneh/isptools.git", puts);

    return true;
  }
};
function puts(error, stdout, stderr) { sys.puts(stdout) }

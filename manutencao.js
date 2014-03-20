var sys = require('sys')
var exec = require('child_process').exec;

module.exports = {
  atualizar: function () {
    
  	console.log(Date());
  	exec("git pull origin master", pull);

    return true;
  }
};
function puts(error, stdout, stderr) {
	sys.puts(stdout);
}
function pull(error, stdout, stderr) {
	var out = stdout.toString().split('\n');

	//out = out.replace(/(\r\n|\n|\r)/gm,"");
  //lout = trim(out).length;
  executa = true;
  out.forEach(function(line) {
        var linha = trim(line);
        if(linha=="Already up-to-date.")
        executa = false;
    });
  sys.puts(out,executa);
	if (executa) {
    console.log('atualizar');
		exec('pm2 reload all',puts);
	}
	// teste
}



/**
 *    Functions
 */

// TRIM
var trim = function (s) {
  var m = s.length;

  for (var i = 0; i < m && s.charCodeAt(i) < 33; i++) {
  }
  for (var j = m - 1; j > i && s.charCodeAt(j) < 33; j--){
  }

  return s.substring(i, j + 1);
};
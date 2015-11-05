
var gulp = require('gulp');
var gutil = require('gulp-util');
var watch = require('gulp-watch');
var babel = require('gulp-babel');

var root = __dirname;

function build() {
    gulp.src('truffle.es6')
        .pipe(babel())
        .pipe(gulp.dest('dist'));

    gulp.src('lib/**/*')
        .pipe(babel())
        .pipe(gulp.dest('dist/lib/'));
}

gulp.task('default', function() {
  build();
});

gulp.task('watch', ['default'], function() {
  var dist_path = root+"/dist";
  var dist_re = new RegExp(dist_path);
  gulp.watch(['truffle.es6', './lib/**/*'], function(event) {
    if (event.path.match(dist_re)) {
      return;
    }
    gutil.log("recompiling", event.path.substr(root.length+1));
    build(); // just do a full rebuild since it's super fast anyway
  });
});

'use strict';

var gulp = require('gulp');
var clean = require('gulp-clean');
var concat = require('gulp-concat');
var less = require('gulp-less');
var rename = require('gulp-rename');
var through = require('through2');
var path = require('path');
var exec = require('child_process').exec;
var replace = require('gulp-replace');
var uglify = require('gulp-uglify');
var shell = require('gulp-shell');
var fs = require('fs');
var distDir = "./dist";
var existsSync = require('fs').existsSync;
var cleancss = require('gulp-cleancss');


var dependencies = require('./package.json').spm.dependencies;

// 获取包文件的路径
function getPackagePath(name) {
    var path = distDir + '/' + name + '/';

    var subDirs = fs.readdirSync(path);
    var version = subDirs[subDirs.length - 1];
    return path + version + '/';
}

/**
 * 重命名包文件的入口文件，因为入口文件有可能为index.js
 * 统一为{package}.js
 */
function renameFile() {
    var stream = through.obj(function (file, enc, callback) {


        var filepath = file.path.split(path.sep),
            module = filepath.slice(filepath.lastIndexOf('dist') + 1), // => [bui-{package}, version, [path,] {main.js}]
            packageName = module[0].split('-')[1],
            filename;
        if (module.length === 3) {
            filename = packageName + '.js';
        }
        else {
            filename = module.slice(2).join(path.sep).replace(/-debug.js$/, '.js');
        }

        file.path = path.join(file.base, filename);

        return callback(null, file);
    });

    return stream;
}

//清理目录
gulp.task('clean', function () {
    return gulp.src([
        './build',
        './spm_modules',
        distDir
    ], {read: false})
        .pipe(clean());
});
//获取依赖的package
gulp.task('prepare', ['init', 'clean'], function (cb) {

    // exec('./node_modules/spm/bin/spm install && ./node_modules/spm/bin/spm build --with-deps && cd ./spm_modules/bui-config/*\.*\.* && ../../../node_modules/spm/bin/spm build -O ../../../dist --with-deps --include standalone', function (err, stdout, stderr) {
    //   cb(stderr);
    // });
    //
    return gulp.src([
        './src/*/'
    ], {read: false})
        .pipe(shell([
            'cd <%=file.path %> && spm install && spm build -O ../../dist'
        ]))

});


//生成依赖包的js文件
gulp.task('package', function () {
    var files = [];
    for (var name in dependencies) {
        if (name != 'seajs') {
            files.push(getPackagePath(name, dependencies[name]) + '**/*-debug.js');
        }
    }
    return gulp.src(files)
        // 重命名包文件的js名
        .pipe(renameFile())
        // 去掉版本号和包名
        .pipe(replace(/bui-(\w+)\/\d.\d.\d\/\w+/g, 'bui/$1'))
        // require.async的时候要把bui-xxx换成bui/xxx
        .pipe(replace(/require\.async\((\'|\")bui-/g, 'require.async($1bui/'))
        // 去掉-debug的后缀
        .pipe(replace(/-debug/g, ''))
        .pipe(gulp.dest('./build'));
});

gulp.task('seed.js', ['package'], function () {
    var tmp_distDir = './spm_modules';
    return gulp.src([
        tmp_distDir + '/seajs/' + dependencies.seajs + '/dist/sea-debug.js',
        './build/config.js',
        './build/common.js'
    ])
        .pipe(concat('seed.js'))
        .pipe(gulp.dest('./build'));
});

gulp.task('bui.js', ['package'], function () {
    var tmp_distDir = './spm_modules';
    return gulp.src([
        tmp_distDir + '/seajs/' + dependencies.seajs + '/dist/sea-debug.js',
        './build/config.js',
        './build/common.js',
        './build/data.js',
        './build/list.js',
        './build/menu.js',
        './build/tab.js',
        './build/mask.js',
        './build/overlay.js',
        './build/picker.js',
        './build/toolbar.js',
        './build/calendar.js',
        './build/select.js',
        './build/form.js',
        './build/editor.js',
        './build/tooltip.js',
        './build/grid.js',
        'all.js'
    ])
        .pipe(concat('bui.js'))
        .pipe(gulp.dest('./build'));
});

// 适配kissy的js
gulp.task('adapter.js', ['package'], function () {
    var tmp_distDir = './spm_modules';
    return gulp.src([
        tmp_distDir + '/bui-adapter/' + dependencies['bui-adapter'] + '/dist/adapter-debug.js',
    ])
        .pipe(rename(function (path) {
            var basename = path.basename;
            path.basename = basename.replace(/-debug$/, '');
        }))
        .pipe(gulp.dest('./build'));
});

gulp.task('script', ['seed.js', 'bui.js', 'adapter.js'/**/], function () {
    return gulp.src([
        './build/**/*.js'
    ])
        .pipe(uglify({
            output: {
                ascii_only: true
            }
        }))
        .pipe(rename({suffix: '-min'}))
        .pipe(gulp.dest('./build'))
});

gulp.task('css', ['package'], function () {
    // gulp.src([
    //   ])
    // .pipe('')
    var files = [];
    for (var name in dependencies) {
        files.push(getPackagePath(name, dependencies[name]) + '**/*.css');
    }
    return gulp.src(files)
        .pipe(rename(function (path) {
            var basename = path.basename;
            if (!(/-debug$/.test(basename))) {
                path.basename = basename + '-min';
            }
        }))
        .pipe(rename(function (path) {
            path.basename = path.basename.replace(/-debug$/, '');
        }))
        .pipe(gulp.dest('./build'));
});

// 图片以及一些其他静态资源
gulp.task('assets', function () {
    var files = [
        '!**/*.js', '!**/*.css'
    ];
    for (var name in dependencies) {
        files.push(getPackagePath(name, dependencies[name]) + '**/*.*');
    }
    return gulp.src(files)
        .pipe(gulp.dest('./build'))
});

//gulp.task('default', ['prepare'], /**/ function () {
//    return gulp.start('package', 'script', 'css', 'assets');
//});

var modules = Object.keys(dependencies).filter(function (x) {
    return x != 'seajs'
});

var processed = {};

function processFile(module, basePath, file, opt, cb) {
    var srcFilePath = path.join(basePath, file);
    debug();
    debug();
    debug(srcFilePath);
    var basePath2 = basePath.replace(/\\/g, '/').replace(/^src\//, '').replace('bui-', 'bui/');
    fs.readFile(srcFilePath, 'utf8', function (e, data) {
        if (e) {
            return void cb(e);
        }
        //debug(data);
        var modules = [];
        data = data.replace(/require\(['"](.+)['"]\)/g, function (d, subModule) {
            if (/bui-.+/.test(subModule)) {
                return 'require("' + subModule.replace('-', '/') + '")';
            }
            var path2 = path.join(basePath, subModule + '.js');

            debug('seek module', subModule, path2, basePath);
            if (!subModule.match(/^./) || !fs.existsSync(path2)) {
                processed[subModule] = true;
                return 'require("' + subModule + '")';
            }
            modules.push(subModule);
            var _basePath = path.resolve(basePath);
            var _subModule = path.resolve(basePath, subModule);
            var relative = path.relative(_basePath, _subModule);
            debug('find module', relative, _basePath, _subModule);
            subModule = relative.replace(/\\/g, '/');
            return 'require("' + basePath2 + '/' + subModule + '")';
        });
        opt = typeof opt === 'string' ? fs.createWriteStream(opt) : opt;
        outputFile(opt, module, data, function (e) {
            if (e) {
                return void cb(e);
            }
            //debug(modules);
            processSubModule(cb);
        });
        function processSubModule(cb) {
            var subModule = modules.shift();
            if (!subModule) {
                return void cb();
            }
            //debug(baseModule, basePath, module);
            var _basePath = path.resolve(basePath);
            var _subModule = path.resolve(basePath, subModule);
            var relative = path.relative(_basePath, _subModule);
            debug('writeModule', module, relative, _basePath, _subModule, path.join(basePath, subModule));
            var module2 = relative.replace(/\\/g, '/');
            var module3 = path.join(basePath2, relative).replace(/\\/g, '/');
            if (processed[module3]) {
                return void setImmediate(processSubModule, cb);
            }
            processFile(module3, path.join(basePath, subModule, '..'), module2.match(/[^\/\\]+$/) + '.js', opt, function (e) {
                if (e) {
                    return void cb(e);
                }
                processSubModule(cb);
            });
        }
    });
}

function debug() {
    //console.log.apply(console, arguments);
}

function outputFile(stream, module, data, cb) {
    processed[module] = true;
    if (module === 'bui/config') {
        return void stream.write(data, 'utf8', function (e) {
            if (e) {
                return cb(e);
            }
            cb();
        });
    }
    stream.write('define("' + module + '", function(require,exports,module){\n', 'utf8', function (e) {
        if (e) {
            return cb(e);
        }
        stream.write(data, 'utf8', function (e) {
            if (e) {
                return cb(e);
            }
            stream.write('\n});\n\n', 'utf8', cb);
        })
    })
}

gulp.task('build-dpl-less', ['init', 'pre-build'], function () {
    return gulp.src(['src/bui-dpl/src/less/*/*.less'])
        .pipe(less())
        .pipe(gulp.dest('dist/css'));
});

gulp.task('build-dpl-img', ['init', 'pre-build'], function () {
    return gulp.src(['src/bui-dpl/src/img/*.*'])
        .pipe(gulp.dest('dist/img'));
});

gulp.task('build-dpl-iconfont', ['init', 'pre-build'], function () {
    return gulp.src(['src/bui-dpl/src/iconfont/*.*'])
        .pipe(gulp.dest('dist/iconfont'));
});

modules.forEach(function (m) {
    gulp.task('init-' + m, function (cb) {
        if (existsSync('src/' + m)) {
            return cb();
        }
        exec('git clone git@github.com:buiteam/' + m + '.git src/' + m, function (e) {
            cb(e);
        });
    });

    if (m === 'bui-dpl') {
        gulp.task('build-' + m, ['init', 'pre-build', 'build-dpl-iconfont', 'build-dpl-less', 'build-dpl-img']);
        return;
    }

    gulp.task('build-' + m, ['init', 'pre-build'], function (cb) {
        var basePath = 'src/' + m;
        var enterPoint = require('./' + basePath + '/package.json').spm.main;
        var opt = path.resolve('dist/' + m.replace(/bui-/, '') + '.js');
        processFile(m.replace('-', '/'), basePath, enterPoint, opt, cb);
    });
});


gulp.task('init', modules.map(function (m) {
    return 'init-' + m;
}));

gulp.task('pre-build', ['clean'], function (cb) {
    fs.mkdir('dist', cb)
});

gulp.task('build', ['init', 'pre-build'].concat(modules.map(function (m) {
    return 'build-' + m;
})));

gulp.task('compress-js', ['build'], function () {
    return gulp.src([
        './dist/*.js'
    ])
        .pipe(uglify({
            output: {
                ascii_only: true
            }
        }))
        .pipe(rename({suffix: '-min'}))
        .pipe(gulp.dest('./dist'))
});

gulp.task('compress-css', ['build'], function () {
    return gulp.src([
        './dist/**/*.css'
    ])
        .pipe(cleancss({
            keepSpecialComments: 0,
            compatibility: 'ie8'
        }))
        .pipe(rename({suffix: '-min'}))
        .pipe(gulp.dest('./dist'))
});

gulp.task('compress', ['build', 'compress-js', 'compress-css']);

gulp.task('default', ['compress']);
(function(){
    var version='20260731-performance5';
    function load(file){
        return new Promise(function(resolve,reject){
            var script=document.createElement('script');
            script.src='landing-lithos-'+file+'.js?v='+version;
            script.onload=resolve;
            script.onerror=reject;
            document.head.appendChild(script);
        });
    }
    load('dom')
        .then(function(){return Promise.all(['nav','heading','copy','spotlight'].map(load));})
        .then(function(){return load('nav-menu');})
        .then(function(){return load('login');})
        .catch(function(error){console.error('[landing-lithos-loader]',error);});
})();

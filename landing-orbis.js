(function(){
    function renderLithosLanding(){
        var lithosPage=document.getElementById('landingPage');
        if(!lithosPage)return;
        if(lithosPage.dataset.landingTheme==='lithos')return;
        lithosPage.dataset.landingTheme='lithos';
        lithosPage.className='lithos-page';
        lithosPage.innerHTML='';
        var lithosLoader=document.createElement('script');
        lithosLoader.src='landing-lithos-loader.js?v=20260725-lithos-default2';
        document.head.appendChild(lithosLoader);
    }

    window.renderLandingTheme=function(theme){
        if(theme==='velorah'&&typeof window.renderVelorahLanding==='function'){
            window.renderVelorahLanding();
            return;
        }
        renderLithosLanding();
    };

    window.renderLandingTheme('lithos');
})();

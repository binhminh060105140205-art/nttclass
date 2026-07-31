(function(){
    function renderLithosLanding(){
        var lithosPage=document.getElementById('landingPage');
        if(!lithosPage)return;
        if(lithosPage.dataset.landingTheme==='lithos')return;
        lithosPage.dataset.landingTheme='lithos';
        lithosPage.className='lithos-page';
        lithosPage.innerHTML='';
        var lithosLoader=document.createElement('script');
        lithosLoader.src='landing-lithos-loader.js?v=20260731-performance5';
        document.head.appendChild(lithosLoader);
    }

    window.renderLandingTheme=function(){
        renderLithosLanding();
    };
})();

var originalFetch=fetch.bind(window);if(!localStorage.pinky_current_user)fetch=function(input,options){options=options||{};var path=new URL(typeof input==='string'?input:input.url,location).pathname,headers=options.headers||{};if(!(headers.Authorization||headers.authorization)&&['/api/students','/api/sessions','/api/scores'].includes(path))return Promise.resolve(new Response('[]'));return originalFetch(input,options)};

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

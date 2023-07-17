// ==UserScript==
// @name         Winners Circle v0.3 
// @namespace    Winners Circle 
// @version      0.3
// @description  Harder than country streaks. 
// @author       echandler 
// @match        https://www.geoguessr.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=geoguessr.com
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let __map = null;
    let oldReverse = null;//window.sgs.reverse;
    let polygons = [];
    let infoWindows = [];
    let playerClick = {};
    let isInTestingState = false;
    let endOfRound = false;

    try {
        // Watch <head> and <body> for the Google Maps script to be added
        let scriptObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.tagName === "SCRIPT" && /googleapis/.test(node.src)) { //node.src.startsWith(MAPS_API_URL)) {
                        node.addEventListener("load", () => {
                            if (!google) return;
                            if (!google?.maps) return;

                            if (scriptObserver) scriptObserver.disconnect();

                            scriptObserver = undefined;

                            init();
                        });
                    }
                }
            }
        });

        scriptObserver.observe(document.head, {
            childList: true,
        });

    } catch (e) {
        alert("Something happened with the GeoGuessr Path Logger script. Reloading the page will probably fix it.");
        // Promise will not short ciruit if reject is called.
        //reject(e);
    }

    function init() {
        const oldMap = google.maps.Map;
        google.maps.Map = Object.assign(
            function (...args) {

                const res = oldMap.apply(this, args);

                this.addListener("click", async (evt) => {
                    if (endOfRound && !isInTestingState) return; 

                    removeAll();

                    playerClick.lat = evt.latLng.lat();
                    playerClick.lng = evt.latLng.lng();

                    let info = await oldReverse({ lat: evt.latLng.lat(), lng: evt.latLng.lng() });

                    let polys = window.sgs.compiledPolygons[info.country.country_code.toLowerCase()];
                    let region = null;

                    for (let m = 0; m < polys.length; m++) {
                        let t = await window.sgs.customReverse({ lat: evt.latLng.lat(), lng: evt.latLng.lng() }, { 'test': [polys[m]] });
                        if (t.error) continue;
                        region = polys[m];
                        break;
                    }

                    let regionArea = areaOfPoly(region);

                    console.log(info.country.country_name, regionArea);

                    let data = localStorage.circleRegionsData ? JSON.parse(localStorage.circleRegionsData) : {};
                    let customCircleSize = parseFloat(data[info.country.country_code.toLowerCase()]);

                    let _circleSize = customCircleSize ? customCircleSize : circleSize(regionArea, 1.0);//regionArea / 3000 * 2000000;

                    let multiplier = parseFloat(data?.multiplier);

                    if (multiplier) {
                        _circleSize *= multiplier;
                    }

                    const circle = new google.maps.Circle({
                        strokeColor: "#FF0000",
                        strokeOpacity: 0.8,
                        strokeWeight: 2,
                        fillColor: "#FF0000",
                        fillOpacity: 0.35,
                        map: __map,
                        center: evt.latLng,
                        radius: Math.ceil(_circleSize),
                        clickable: false,
                    });

                    polygons.push(circle);
                });

                __map = this;

                return res;
            },
            {
                prototype: Object.create(oldMap.prototype),
            }
        );
    }
    
    function removeAll(){

        polygons.forEach(p => p.setMap(null));
        polygons = [];

        infoWindows.forEach(p => p.setMap(null));
        infoWindows = [];

    }
    
    setInterval((arg1) => {
        // Detect if polygons need to be removed for next round.
        let correctLocation = document.querySelector('img[alt="Correct location"]');

        if (!correctLocation && endOfRound == true) {
            // Correct location was visible now it isn't. Must be a new round.
            removeAll();
            endOfRound = false;
            isInTestingState = false;
        } else if (correctLocation)  {
            // Correct location is visible. Must be end of round screen.
           endOfRound = true;
        }

    }, 1000);

    setTimeout(() => {

        oldReverse = window.sgs.reverse;

        let previousRegion = null;

        window.sgs.reverse = async function (...args) {
            let info = await oldReverse.apply(null, args);

            let latLng = args[0];

            if (playerClick.lat !== undefined && (playerClick.lat == latLng.lat || playerClick.lng == latLng.lng)) {
                playerClick._info = info;
            }

            if (info.error) return info; 

            if (playerClick.lat !== undefined && (playerClick.lat !== latLng.lat || playerClick.lng !== latLng.lng)) {
                // Must be the correct location.

                removeAll();

                let polys = window.sgs.compiledPolygons[info.country.country_code.toLowerCase()];
                let region = null;

                for (let m = 0; m < polys.length; m++) {
                    let t = await window.sgs.customReverse(args[0], { 'test': [polys[m]] });
                    if (t.error) continue;
                    region = polys[m];
                    break;
                }
                
                let regionArea = areaOfPoly(region);

                let dist = getDistance(latLng, playerClick._info);

                let data = localStorage.circleRegionsData? JSON.parse(localStorage.circleRegionsData): {};

                let customCircleSize = parseFloat(data[info.country.country_code.toLowerCase()]);

                let _circleSize = customCircleSize? customCircleSize: circleSize(regionArea, 1.0);//regionArea / 3000 * 2000000;

                let multiplier = parseFloat(data?.multiplier);
                
                if (multiplier){
                    _circleSize *= multiplier;
                }

                if (dist < _circleSize && playerClick._info) {
                        let prevFetech = window.fetch._prev[window.fetch._prev.length - 1];
                        prevFetech.address.country = `Winners Circle (${info.country.country_name})`;
                        prevFetech.address.country_code = "WC";
                }

                const circle = new google.maps.Circle({
                    strokeColor: "#00FF00",
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: "#00FF00",
                    fillOpacity: 0.35,
                    map: __map,
                    center: latLng,
                    radius: Math.ceil(_circleSize),
                });

                polygons.push(circle);

                if (playerClick._info)
                    playerClick = {};

                info.country = {
                    admin_country_code: "WC",
                    admin_country_name: `Winners Circle (${info.country.country_name})`,
                    country_code: "WC",
                    country_name: `Winners Circle (${info.country.country_name})`,
                };
            }


            return info;

        };

    }, 500)
    
    function circleSize(regionArea, multiplier = 1.0){
                let circleSize = 0;//regionArea / 3000 * 2000000;
               // let multiplier = 1.0;

                if (regionArea < 0.1){
                    circleSize = 12000; 
                } else if (regionArea < 0.2){
                    circleSize = 12000; 
                } else if (regionArea < 1.0){
                    circleSize = 10000; 
                } else if (regionArea < 6){
                    circleSize = regionArea * 11000; 
                } else if (regionArea < 8){ // Belgium
                    circleSize = regionArea * 9000; 
                } else if (regionArea < 20){ // Lithuania
                    circleSize = regionArea * 6000; 
                } else if (regionArea < 25){// Malaysia
                    circleSize = regionArea * 5000; 
                } else if (regionArea < 35){// South korea 
                    circleSize = regionArea * 3000; 
                } else if (regionArea < 50){
                    circleSize = regionArea * 4500; 
                } else if (regionArea < 200){
                    circleSize = regionArea * 2000; 
                } else if (regionArea < 300){ // Peru
                    circleSize = regionArea * 1600; 
                } else if (regionArea < 500){
                    circleSize = regionArea * 1300; 
                } else if (regionArea < 800){
                    circleSize = regionArea * 900; 
                } else if (regionArea < 1000){
                    circleSize = regionArea * 500; 
                } else if (regionArea < 1500){ // india
                    circleSize = regionArea * 700; 
                } else if (regionArea < 2000){
                    circleSize = regionArea * 450; 
                } else if (regionArea < 5000){ // Canada
                    circleSize = regionArea * 200; 
                } else if (regionArea > 5000){
                    circleSize = regionArea * 150; 
                }
                
                circleSize *= multiplier;
                
                return circleSize;
    }
    
    function areaOfPoly(poly){
        // https://mathopenref.com/coordpolygonarea.html
        let ans = 0;
        let prev = poly[0];

        for (let n = 1; n < poly.length; n++){
            ans += (prev[0] * poly[n][1]) - (prev[1] * poly[n][0]);
            prev = poly[n];
        }
        
        ans += (prev[0] * poly[0][1]) - (prev[1] * poly[0][0]);

        return Math.abs(ans);
    }

    function makePoly(coords) {
        let ret = [];
        coords.forEach((_c) => {
            let p = [];
            _c.forEach(c => {
                p.push({ lat: c[1], lng: c[0] });
            });
            ret.push(p);
        });
        return ret;
    }

    const getDistance = function (p1, p2) {
        return window.google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
    };
    
    function initMenu(){
        let script = document.createElement('script');
        script.src = "https://unpkg.com/sweetalert/dist/sweetalert.min.js";
        script.addEventListener('load', makeMenu);
        document.body.appendChild(script);
    }
    
    function makeMenu() {
        let wrapper = document.createElement('div');
        let table = document.createElement('table');
        let data = localStorage.circleRegionsData ? JSON.parse(localStorage.circleRegionsData) : {};

        let countries = Object.keys(window.sgs.compiledPolygons);
        
        countries.forEach((x,i,a)=> a[i] = [window.sgs.country_code_to_name_index[x.toUpperCase()], x]);
        countries.sort();

        wrapper.style.cssText = `max-height: 50vh; overflow-y:scroll;`;

        // Add multiplier row
        let multiplier_tr = document.createElement('tr');
        let multiplier_td1 = document.createElement('td');
        multiplier_td1.innerText = "Multiplier";

        let multiplier_td2 = document.createElement('td');
        let multiplier_input = document.createElement('input');
        multiplier_input.value = "1.0";
        multiplier_td2.appendChild(multiplier_input);
        multiplier_input._country = 'multiplier';

        if (data.multiplier) {
            multiplier_input.value = data.multiplier;
        }

        multiplier_input.addEventListener('keypress', inputKeypressEvt);
        multiplier_input.addEventListener('keypress', inputChangeEvt);

        multiplier_tr.appendChild(multiplier_td1);
        multiplier_tr.appendChild(multiplier_td2);

        table.appendChild(multiplier_tr);
        // End multiplier row

        for (let n = 0; n < countries.length; n++) {
            let tr = document.createElement('tr');
            let td1 = document.createElement('td');
            td1.innerText = countries[n][0];// window.sgs.country_code_to_name_index[countries[n].toUpperCase()];

            let td2 = document.createElement('td');
            let input = document.createElement('input');
            td2.appendChild(input);
            input._country = countries[n][1];

            if (data[countries[n][1]]) {
                input.value = parseFloat(data[countries[n][1]]).toLocaleString();
            }

            input.addEventListener('keypress', inputKeypressEvt);
            input.addEventListener('change', inputChangeEvt);

            tr.appendChild(td1);
            tr.appendChild(td2);

            table.appendChild(tr);
        }
        
        let downloadButton = document.createElement('button');
        downloadButton.innerText = 'Download circle size data';
        downloadButton.addEventListener('click', function () {
            let data = localStorage.circleRegionsData ? localStorage.circleRegionsData : {};
            var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(data);
            var dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "geoguessrRegionsCircleSizeData.json");
            dlAnchorElem.click();
        })

        let clearDataButton = document.createElement('button');
        clearDataButton.innerText = 'Clear all values';
        clearDataButton.addEventListener('click', function () {
            delete localStorage.circleRegionsData;
        })

        wrapper.appendChild(table);
        wrapper.appendChild(downloadButton);
        wrapper.appendChild(clearDataButton);

        swal(
            {
                title: 'Change circle size in meters',
                content: wrapper,
            }
        )

        function inputKeypressEvt(e){
            e.stopPropagation();
        }

        function inputChangeEvt(e){
            isInTestingState = true; 
            this.value = this.value.replace(/\,/g, '');
            updateLocalStorage(this);
            this.value = parseFloat(this.value).toLocaleString();
        }

        function updateLocalStorage(el) {

            let data = localStorage.circleRegionsData ? JSON.parse(localStorage.circleRegionsData) : {};

            data[el._country] = el.value;

            localStorage.circleRegionsData = JSON.stringify(data);
        }
    }
    
    document.body.addEventListener('keypress', function(e){
        if (e.key === 'q' || e.key === 'Q'){
            initMenu();
        }
    });
})();

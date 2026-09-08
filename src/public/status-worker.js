'use strict';
importScripts('./planning-core.js','./engine.js','./status-check.js');
self.onmessage=event=>RetirementStatusCheck(event.data);

'use strict';
importScripts('./planning-core.js','./engine.js','./status-check.js','./worker-tasks.js');
self.onmessage=event=>runRetirementTask('optimization',event.data);

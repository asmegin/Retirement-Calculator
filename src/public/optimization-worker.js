'use strict';
importScripts('./planning-core.js','./engine.js','./plan-optimizer.js','./status-check.js','./worker-tasks.js');
self.onmessage=event=>runRetirementTask('optimization',event.data);

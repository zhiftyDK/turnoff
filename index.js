const express = require("express");
const app = express();
const icloud = require("find-my-iphone").findmyphone;
const Datastore = require("nedb");
const cors = require("cors");
var ip = require("ip");
const { response } = require("express");

//Assign and load local databases
const devicesDB = new Datastore("./databases/devices.db");
const barrierDB = new Datastore("./databases/barrier.db");
devicesDB.loadDatabase();
barrierDB.loadDatabase();

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.static("public"));
app.use(cors());

let deviceTable = [];
devicesDB.find({}, (err, output) => {
    output.forEach(device => {
        deviceTable.push({
            appleid: device.appleid,
            device: device.device,
            InBarrier: true
        });
    });
});

app.get("/", (req, res) => {
    res.render("index", { ipAddress:ip.address(), deviceTable:JSON.stringify(deviceTable)});
});

//Add a device to the database
app.post("/addDevice", (req, res) => {
    getDevices(req.body.appleid, req.body.password)
    .then(device => {
        if (device) {
            //There is a device
            devicesDB.find({deviceid: device.id}, (err, output) => {
                if(output.length === 0) {
                    checkInsideBarrier(device.location.longitude, device.location.latitude)
                    .then(data => {
                        devicesDB.insert({device: device.deviceDisplayName, deviceid: device.id, appleid: req.body.appleid, password: req.body.password, latitude: device.location.latitude, longitude: device.location.longitude, insideBarrier: data.insideBarrier});
                        res.send({added: true, deviceid: device.id});
                    });
                } else {
                    res.send({added: false, deviceid: device.id, error: "The device already exist!"});
                }
            });
        } else {
            res.send({added: false, error: "FindmyIphone is not enabled on any of the devices attatched to this appleid!"});
        }
    });
});

app.get("/getDevices", (req, res) => {
    devicesDB.find({}, (err, output) => {
        let temp = [];
        if(output.length != 0) {
            output.forEach(device => {
                temp.push(device);
            });
            res.send(temp);
        } else {
            res.send({error: "No devices in the database!"});
        }
    });
});

app.delete("/deleteDevice", (req, res) => {
    devicesDB.remove({ deviceid: req.body.deviceid }, {}, (err, numRemoved) => {
        res.send({deleted: true, message: `Deviceid: ${req.body.deviceid}, has been removed!`});
    });
});

app.post("/addBarrier", (req, res) => {
    barrierDB.remove({ }, { multi: true }, function (err, numRemoved) {
        barrierDB.loadDatabase(function (err) {
            barrierDB.insert({longitude: req.body.longitude, latitude: req.body.latitude, radius: req.body.radius});
            res.send({added: true});
            devicesDB.find({}, (err, output) => {
                for (let i = 0; i < output.length; i++) {
                    const device = output[i];
                    checkInsideBarrier(device.longitude, device.latitude)
                    .then(data => {
                        devicesDB.update(
                            {deviceid: device.deviceid}, 
                            { $set: {insideBarrier: data.insideBarrier} }, 
                            {},
                            ((err, numUpdated) => {
                                console.log("Updated insidebarrier status of: " + device.device);
                                devicesDB.loadDatabase();
                            })
                        );
                    });
                }
            })
        });
    });
})

app.get("/getBarrier", (req, res) => {
    barrierDB.find({}, (err, output) => {
        if(output.length != 0) {
            output.forEach(barrier => {
                res.send(barrier);
            });
        } else {
            res.send({error: "No barrier found!"});
        }
    });
});

//Check if in circle
function checkInsideBarrier(myLocationX, myLocationY) {
    return new Promise((resolve, reject) => {
        barrierDB.find({}, (err, output) => {
            if(output.length != 0) {
                output.forEach(barrier => {
                    //Create Radius of home location
                    let radius = parseFloat(barrier.radius),
                    longitude = parseFloat(barrier.longitude),
                    latitude = parseFloat(barrier.latitude);
                    const coef =  radius * 10 / 111320;
                    const xSlut = longitude + coef / Math.cos(latitude * 0.01745);
                    const xStart = longitude - coef / Math.cos(latitude * 0.01745);
                    const ySlut = latitude + coef;
                    const yStart = latitude - coef;
    
                    //Check if member is inside location
                    if(xStart < myLocationX && xSlut > myLocationX) {
                        if(yStart < myLocationY && ySlut > myLocationY) {
                            resolve({insideBarrier: true});
                        } else {
                            resolve({insideBarrier: false});
                        }
                    } else {
                        resolve({insideBarrier: false});
                    }
                });
            } else {
                resolve({insideBarrier: false});
            }
        });
    });
}

//Update the location of all devices in the database
function updateLocation() {
    devicesDB.find({}, (err, output) => {
        for (let i = 0; i < output.length; i++) {
            const device = output[i];
            getDevices(device.appleid, device.password)
            .then(deviceNewLocation => {
                checkInsideBarrier(deviceNewLocation.location.longitude, deviceNewLocation.location.latitude)
                .then(data => {
                    devicesDB.update(
                        {deviceid: device.deviceid}, 
                        { $set: {latitude: deviceNewLocation.location.latitude, longitude: deviceNewLocation.location.longitude, insideBarrier: data.insideBarrier} }, 
                        {},
                        ((err, numUpdated) => {
                            console.log("Updated location of: " + device.device);
                            devicesDB.loadDatabase();
                        })
                    );
                });
            });
        }
    })
}

setInterval(() => {
    updateLocation();
}, 1000 * 60 * 5);

//Get all devices attatched to appleid with findmyiphone enabled
function getDevices(appleid, password) {
    return new Promise((resolve, reject) => {
        icloud.apple_id = appleid;
        icloud.password = password;
        icloud.getDevices(function(error, devices) {
            var device;
            if (error) {
                throw error;
            }
            //pick a device with location and findMyPhone enabled
            devices.forEach(function(d) {
                if (device == undefined && d.location && d.lostModeCapable) {
                    device = d;
                }
            });
            resolve(device);
        });
    });
}

app.listen(3000, () => {
    updateLocation();
    console.log(`App started on http://${ip.address()}:3000`);
});
const express = require("express");
const app = express();
const icloud = require("find-my-iphone").findmyphone;
const Datastore = require("nedb");

//Assign and load local device database
const devicesDB = new Datastore("devices.db");
devicesDB.loadDatabase();

app.set("view engine", "ejs");
app.use(express.json());

app.get("/", (req, res) => {
    res.render("index", {text: "pølse"});
});

//Add a device to the database
app.post("/addDevice", (req, res) => {
    getDevices(req.body.appleid, req.body.password)
    .then(device => {
        if (device) {
            //There is a device 
            devicesDB.find({deviceid: device.id}, (err, output) => {
                if(output.length === 0) {
                    devicesDB.insert({device: device.deviceDisplayName, deviceid: device.id, appleid: req.body.appleid, password: req.body.password, latitude: device.location.latitude, longitude: device.location.longitude});
                    res.send({added: true, deviceid: device.id});
                } else {
                    res.send({added: false, deviceid: device.id, error: "The device already exist!"});
                }
            });
        } else {
            res.send({added: false, error: "FindmyIphone is not enabled on any of the devices attatched to this appleid!"});
        }
    });

})

//Update the location of all devices in the database
function updateLocation() {
    devicesDB.find({}, (err, output) => {
        for (let i = 0; i < output.length; i++) {
            const device = output[i];
            getDevices(device.appleid, device.password)
            .then(deviceNewLocation => {
                devicesDB.update(
                    {deviceid: device.deviceid}, 
                    { $set: {latitude: deviceNewLocation.location.latitude, longitude: deviceNewLocation.location.longitude} }, 
                    {},
                    ((err, numUpdated) => {
                        console.log("Updated location of: " + device.device);
                        devicesDB.loadDatabase();
                    })
                )
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
    console.log("App started on http://localhost:3000");
});
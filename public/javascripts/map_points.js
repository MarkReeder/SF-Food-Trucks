(function() {
    var mapOptions = {
            zoom: 13,
            center: new google.maps.LatLng(37.7856101001445,-122.408154764336)
        },
        map = null,
        searchMarkers = [],
        currentInfoWindow = null,
        oms = null,
        dbRoot = 'https://sf-food-trucks.cloudant.com/trucks/',
        dbApprovedTrucksPath = dbRoot + '_design/approved/_view/approvedTrucksView';

    var Truck = Backbone.Model.extend({
        initialize: function(options) {
            this.name       = options.key;
            this.location   = options.value;
        },
        getDetails: function() {
            var truck = this,
                deferred = $.Deferred();
            if(this.applicant) {
                deferred.resolve();
            } else {
                $.getJSON(dbRoot + this.id + '?callback=?', function(data) {
                    truck.applicant = data.applicant;
                    truck.address   = data.address;
                    truck.fooditems = data.fooditems;
                    truck.schedule  = data.schedule;
                    deferred.resolve();
                });
            }
            return deferred;
        },
        showInfoWindow: function(marker) {
            var truck = this;

            this.getDetails().done(function() {
                var infoWindow = new google.maps.InfoWindow({
                    content: function() {
                        var returnStr = '';
                        returnStr += '<h1>' + truck.applicant + '</h1>';
                        returnStr += '<p>' + truck.address + '</p>';
                        returnStr += '<p>' + truck.fooditems + '</p>';
                        returnStr += '<br />';
                        returnStr += '<a href="' + truck.schedule + '">View Schedule</a> (pdf)';
                        return returnStr;
                    }()
                });
                if(currentInfoWindow) {
                    currentInfoWindow.close();
                }
                currentInfoWindow = infoWindow;
                infoWindow.open(map,marker);
            });
        }
    });

    var trucks = new Backbone.Collection([], {
        model: Truck
    });

    trucks.getSortedByDistance = function(coords) {
        var getDistance = function(truckLocation) {
            var toRad = function(num) { return num * Math.PI / 180; };
            var lat1 = coords.latitude,
                lon1 = coords.longitude,
                lat2 = (truckLocation && truckLocation.latitude)?parseFloat(truckLocation.latitude):null,
                lon2 = (truckLocation && truckLocation.longitude)?parseFloat(truckLocation.longitude):null;
            if(lat2 === null || lon2 === null) { return; }
            var R = 6371, // km
                kmToMi = 0.621371192,
                dLat = toRad(lat2-lat1),
                dLon = toRad(lon2-lon1);
            var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c * kmToMi;
        };
        return _.clone(this.models).sort(function(a,b) {
                var aD=getDistance(a.location),bD=getDistance(b.location);
                if(!isNaN(aD) && isNaN(bD)) { return -1; }
                if(isNaN(aD) && !isNaN(bD)) { return 1; }
                return aD==bD?0:aD<bD?-1:1;
            })
    };

    trucks.on("add", function(truck) {
        if(!(truck.name && truck.location)){ return; }
        var marker = new google.maps.Marker({
            position: new google.maps.LatLng(truck.location.latitude,truck.location.longitude),
            map: map,
            title: truck.name,
            _id: truck.id
        });
        oms.addMarker(marker);
    });

    function setCurrentLocation(position) {
        var mapPosition = new google.maps.LatLng(position.coords.latitude,position.coords.longitude);

        new google.maps.Marker({
            map: map,
            title: 'Your Current Location',
            position: mapPosition
        });
        centerAndZoom(mapPosition);
    }

    function centerAndZoom(mapPosition) {
        map.panTo(mapPosition);
        var sortedTrucks = trucks.getSortedByDistance({latitude: mapPosition.lat(), longitude: mapPosition.lng()});
        // console.log('sortedTrucks', sortedTrucks);

        var bounds = new google.maps.LatLngBounds();
        bounds.extend(mapPosition);
        for(var i = 0; i <= 2; i += 1) {
            bounds.extend(new google.maps.LatLng(sortedTrucks[i].location.latitude, sortedTrucks[i].location.longitude));
        }
        map.fitBounds(bounds);
    }

    function initialize() {
        map = new google.maps.Map($('#map-canvas')[0], mapOptions);
        oms = new OverlappingMarkerSpiderfier(map, {
                keepSpiderfied: true,
                nearbyDistance: 5,
                legWeight: 1
            });
        var searchBox = new google.maps.places.SearchBox($('#map-search')[0]);

        oms.addListener('click', function(marker, event) {
            trucks.get(marker._id).showInfoWindow(marker);
        });

        $('.get-current-location').on('click', function() {
            if(Modernizr.geolocation) {
                navigator.geolocation.getCurrentPosition(setCurrentLocation);
            }
        });

        google.maps.event.addListener(searchBox, 'places_changed', function() {
            var places = searchBox.getPlaces();

            for (var i = 0, marker; marker = searchMarkers[i]; i++) {
                marker.setMap(null);
            }

            // For each place, get the icon, place name, and location.
            searchMarkers = [];
            var place = places[0];
            var image = {
                url: place.icon,
                size: new google.maps.Size(71, 71),
                origin: new google.maps.Point(0, 0),
                anchor: new google.maps.Point(17, 34),
                scaledSize: new google.maps.Size(25, 25)
            };

            // Create a marker for each place.
            var marker = new google.maps.Marker({
                map: map,
                icon: image,
                title: place.name,
                position: place.geometry.location
            });

            searchMarkers.push(marker);

            centerAndZoom(place.geometry.location);

            console.log('zoom', map.getZoom());
            // map.setZoom(18);
        });

        $.getJSON(dbApprovedTrucksPath + '?limit=1000&reduce=false&callback=?', function(data){
            var dataRows = data.rows;
            trucks.add(dataRows);
        });
    }

    google.maps.event.addDomListener(window, 'load', initialize);
    Backbone.history.start({pushState: true});
})();
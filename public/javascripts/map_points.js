(function() {
    var mapOptions = {},
        map = null,
        bounds = new google.maps.LatLngBounds(),
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
        var getRelativeDistance = function(truckLocation) {
            var x = ((truckLocation && truckLocation.latitude)?parseFloat(truckLocation.latitude):NaN) - coords.latitude,
                y = ((truckLocation && truckLocation.longitude)?parseFloat(truckLocation.longitude):NaN) - coords.longitude,
                d = NaN;
            x = x * x;
            y = y * y;
            d = Math.sqrt(x + y);
            return isNaN(d)?Infinity:d;
        };
        return _.clone(this.models).sort(function(a,b) {
                var aD=getRelativeDistance(a.location),bD=getRelativeDistance(b.location);
                if(!isNaN(aD) && isNaN(bD)) { return -1; }
                if(isNaN(aD) && !isNaN(bD)) { return 1; }
                return aD==bD?0:aD<bD?-1:1;
            })
    };

    trucks.on("add", function(truck) {
        if(!(truck.name && truck.location)){ return; }
        var truckPosition = new google.maps.LatLng(truck.location.latitude,truck.location.longitude);
        var marker = new google.maps.Marker({
            position: truckPosition,
            map: map,
            title: truck.name,
            _id: truck.id
        });
        oms.addMarker(marker);
        extendBounds(truckPosition);
    });

    function extendBounds(truckPosition) {
        bounds.extend(truckPosition);
        _fitBounds();
    }

    var _fitBounds = _.debounce(function() {
        map.fitBounds(bounds);
    }, 100);

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
        var trucksToShow = 3;
        map.panTo(mapPosition);
        var sortedTrucks = trucks.getSortedByDistance({latitude: mapPosition.lat(), longitude: mapPosition.lng()});

        bounds = new google.maps.LatLngBounds();
        bounds.extend(mapPosition);
        for(var i = 0; i < trucksToShow; i += 1) {
            bounds.extend(new google.maps.LatLng(sortedTrucks[i].location.latitude, sortedTrucks[i].location.longitude));
        }
        map.fitBounds(bounds);
    }

    function resetMarkers() {
        for (var i = 0, marker; marker = searchMarkers[i]; i++) {
            marker.setMap(null);
        }

        searchMarkers = [];
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
            resetMarkers();
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
        });

        $.getJSON(dbApprovedTrucksPath + '?limit=1000&reduce=false&callback=?', function(data){
            var dataRows = data.rows;
            trucks.add(dataRows);
        });
    }

    google.maps.event.addDomListener(window, 'load', initialize);
    Backbone.history.start({pushState: true});
})();
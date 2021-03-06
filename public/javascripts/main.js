(function() {
    var mapOptions = {},
        map = null,
        searchBox = null,
        searchMarkers = [],
        currentInfoWindow = null,
        oms = null,
        dbRoot = 'https://sf-food-trucks.cloudant.com/trucks/',
        dbApprovedTrucksPath = dbRoot + '_design/approved/_view/approvedTrucksView',
        truckDetailsTemplate = null;

    google.maps.event.addDomListener(window, 'load', initializeMap);
    $(document).ready(function() {
        var seenTour = Modernizr.localstorage && localStorage.getItem('seenTour');
        truckDetailsTemplate = _.template($('#truckDetailsTemplate').html());

        $('body').on('click', '.close-modal', function() {
            currentInfoWindow.close();
        });

        $('body').on('click', '.get-current-location', function() {
            var $this = $(this);
            if(Modernizr.geolocation) {
                $this.addClass('searching');
                navigator.geolocation.getCurrentPosition(function(position) {
                    $this.removeClass('searching');
                    setCurrentLocation(position);
                }, function() {
                    $this.removeClass('searching');
                    alert('Unable to find your location, try searching.');
                });
            }
        });
        if(!seenTour) {
            var steps = [{
                content: '<p>Welcome to SF Food Trucks. You may search for a location to find nearby food trucks.</p>',
                highlightTarget: true,
                nextButton: true,
                target: $('#map-search'),
                my: 'top center',
                at: 'bottom center'
            }, {
                content: '<p>Or your current location can be found automatically.</p>',
                highlightTarget: true,
                nextButton: true,
                target: $('#get-current-location'),
                my: 'top center',
                at: 'bottom center'
            }];

            var tour = new Tourist.Tour({
                steps: steps,
                tipClass: 'Bootstrap',
                tipOptions:{ showEffect: 'slidein' }
            });
            tour.start();
            if(Modernizr.localstorage) {
                localStorage.setItem('seenTour', 1);
            }
        }

    });

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
        panTo: function() {
            var truckPosition = new google.maps.LatLng(this.location.latitude, this.location.longitude);
            try {
                map.panTo(truckPosition);
                map.panBy(0,-75); // Account for search box at the top of the page
            } catch(e) {} // Discard errors
        },
        showInfoWindow: function() {
            var truck = this;

            this.getDetails().done(function() {
                var content = truckDetailsTemplate(truck),
                    $modal = null;
                if(currentInfoWindow) {
                    currentInfoWindow.close();
                }
                if($(window).width() > 980) {
                    var infoWindow = new google.maps.InfoWindow({
                            content: content,
                            pixelOffset: new google.maps.Size(0,-35),
                            disableAutoPan: true
                        }),
                        truckPosition = new google.maps.LatLng(truck.location.latitude, truck.location.longitude);
                    currentInfoWindow = infoWindow;
                    infoWindow.setPosition(truckPosition);
                    infoWindow.open(map);
                    truck.panTo();
                    google.maps.event.addListener(infoWindow, 'closeclick', function() {
                        router.navigate('/', {trigger: true});
                    });
                } else { // Render full-screen overlay for mobile devices
                    $modal = $('.modal').omniWindow({callbacks:{positioning: $.noop}})
                        .html(content)
                        .trigger('show');
                    currentInfoWindow = {
                        close: function() {
                            $modal.trigger('hide');
                            router.navigate('/', {trigger: true});
                        }
                    };
                }
            });
        }
    });

    var trucks = new Backbone.Collection([], {
        model: Truck
    });

    trucks.bounds = new google.maps.LatLngBounds();
    trucks.pendingTruckId = null;

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

    trucks.extendBounds = function(truckPosition) {
        this.bounds.extend(truckPosition);
        this._fitBounds();
    };

    trucks._fitBounds = _.debounce(function() {
        map.fitBounds(this.bounds);
        if(this.pendingTruckId) {
            var truck = trucks.get(this.pendingTruckId);
            truck.panTo();
        }
        searchBox.setBounds(this.bounds);
    }, 100);

    trucks.centerAndZoom = function(mapPosition) {
        var minTrucksToShow = 3;
        map.panTo(mapPosition);
        var sortedTrucks = trucks.getSortedByDistance({latitude: mapPosition.lat(), longitude: mapPosition.lng()});

        this.bounds = new google.maps.LatLngBounds();
        this.bounds.extend(mapPosition);
        for(var i = 0; i < minTrucksToShow; i += 1) {
            this.bounds.extend(new google.maps.LatLng(sortedTrucks[i].location.latitude, sortedTrucks[i].location.longitude));
        }
        map.fitBounds(this.bounds);
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
        this.extendBounds(truckPosition);
        if(truck.id === this.pendingTruckId) {
            truck.showInfoWindow();
        }
    });

    var Router = Backbone.Router.extend({

        routes: {
            "":                 "index",
            "truck/:name/:id":  "truck"
        },

        index: function() {
            if(currentInfoWindow) {
                currentInfoWindow.close();
            }
        },

        truck: function(truckName, truckId) {
            var truck = trucks.get(truckId);
            if(truck) {
                truck.showInfoWindow();
            } else {
                trucks.pendingTruckId = truckId;
            }
        }

    });
    var router = new Router();

    function setCurrentLocation(position) {
        var mapPosition = new google.maps.LatLng(position.coords.latitude,position.coords.longitude);

        new google.maps.Marker({
            map: map,
            title: 'Your Current Location',
            position: mapPosition
        });
        trucks.centerAndZoom(mapPosition);
    }

    function resetMarkers() {
        for (var i = 0, marker; marker = searchMarkers[i]; i++) {
            marker.setMap(null);
        }

        searchMarkers = [];
    }

    function initializeMap() {
        map = new google.maps.Map($('#map-canvas')[0], mapOptions);

        oms = new OverlappingMarkerSpiderfier(map, {
                keepSpiderfied: true,
                nearbyDistance: 5,
                legWeight: 1
            });
        searchBox = new google.maps.places.SearchBox($('#map-search')[0]);

        oms.addListener('click', function(marker, event) {
            router.navigate('truck/' + encodeURIComponent(marker.title).replace(/%20/g, '+') + '/' + marker._id, {trigger: true});
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

            // Create a marker for the first search result
            var marker = new google.maps.Marker({
                map: map,
                icon: image,
                title: place.name,
                position: place.geometry.location
            });

            searchMarkers.push(marker);

            trucks.centerAndZoom(place.geometry.location);
        });

        $.getJSON(dbApprovedTrucksPath + '?limit=1000&reduce=false&callback=?', function(data){
            var dataRows = data.rows;
            trucks.add(dataRows);
        });
    }

    Backbone.history.start({pushState: true});
})();